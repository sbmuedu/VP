// src/real-time/real-time.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { RealTimeService } from './real-time.service';
import { JwtService } from '@nestjs/jwt';
import { SessionsService } from '../sessions/sessions.service';
import { UserRole } from '@BackEnd/sharedTypes';
import {
  ConnectSessionDto,
  RealTimeMessageDto,
  ChatMessageDto,
  TypingIndicatorDto,
  ConnectionStatusDto,
  ChatMessageType,
} from './dto';

interface AuthMessage {
  token: string;
}

interface SubscribeMessage {
  sessionId: string;
}

@WebSocketGateway(8080, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
})
export class RealTimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server | undefined;

  constructor(
    private realTimeService: RealTimeService,
    private jwtService: JwtService,
    private sessionsService: SessionsService,
  ) { }

  /**
   * Handles new WebSocket connections
   */
  async handleConnection(client: WebSocket, ...args: any[]): Promise<void> {
    console.log('Client connected');

    // Wait for authentication message
    client.once('message', async (data: string) => {
      try {
        const message: AuthMessage = JSON.parse(data);

        if (message.token) {
          await this.authenticateClient(client, message.token);
        } else {
          client.close(1008, 'Authentication required');
        }
      } catch (error) {
        client.close(1008, 'Invalid authentication message');
      }
    });

    // Set timeout for authentication
    setTimeout(() => {
      if (!this.getClientUserId(client)) {
        client.close(1008, 'Authentication timeout');
      }
    }, 5000);
  }

  /**
   * Handles client disconnection
   */
  handleDisconnect(client: WebSocket): void {
    const userId = this.getClientUserId(client);
    if (userId) {
      this.realTimeService.handleDisconnection(userId);
    }
  }

  /**
   * Handles session subscription
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    client: WebSocket,
    payload: SubscribeMessage,
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) {
      client.send(JSON.stringify({
        type: 'ERROR',
        message: 'Not authenticated',
      }));
      return;
    }

    try {
      // Verify user has access to this session
      const session = await this.sessionsService.getSession(
        payload.sessionId,
        userId,
        this.getClientUserRole(client)!, // This would need to be stored during authentication
      );

      this.realTimeService.subscribeToSession(userId, payload.sessionId);

      client.send(JSON.stringify({
        type: 'SUBSCRIBED',
        sessionId: payload.sessionId,
      }));
    } catch (error) {
      client.send(JSON.stringify({
        type: 'ERROR',
        message: 'Access denied to session',
      }));
    }
  }

  /**
   * Handles session unsubscription
   */
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    client: WebSocket,
    payload: SubscribeMessage,
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) return;

    this.realTimeService.unsubscribeFromSession(userId, payload.sessionId);

    client.send(JSON.stringify({
      type: 'UNSUBSCRIBED',
      sessionId: payload.sessionId,
    }));
  }

  /**
   * Handles ping messages for connection health
   */
  @SubscribeMessage('ping')
  handlePing(client: WebSocket): void {
    client.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
  }

  @SubscribeMessage('connect-session')
  async handleConnectSession(
    client: WebSocket,
    payload: ConnectSessionDto,
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) return;

    this.realTimeService.subscribeToSession(userId, payload.sessionId);

    // Update connection status
    await this.realTimeService.updateConnectionStatus(
      userId,
      payload.sessionId,
      'connected',
      payload.connectionMetadata
    );

    // Notify others that user joined
    await this.realTimeService.notifyUserJoined(payload.sessionId, userId, payload.userRole);
  }

  @SubscribeMessage('disconnect-session')
  async handleDisconnectSession(
    client: WebSocket,
    payload: { sessionId: string },
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) return;

    this.realTimeService.unsubscribeFromSession(userId, payload.sessionId);

    // Update connection status
    await this.realTimeService.updateConnectionStatus(
      userId,
      payload.sessionId,
      'disconnected'
    );

    // Notify others that user left
    await this.realTimeService.notifyUserLeft(
      payload.sessionId, userId,
      this.getClientUserRole(client)!);
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    client: WebSocket,
    payload: RealTimeMessageDto,
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) return;

    // Validate user has access to this session
    if (!this.realTimeService.isUserSubscribed(userId, payload.sessionId)) {
      client.send(JSON.stringify({
        type: 'ERROR',
        message: 'Not subscribed to this session',
      }));
      return;
    }

  // The activity will be updated automatically when we call handleChatMessage
  await this.realTimeService.handleChatMessage(
    {
      sessionId: payload.sessionId,
      content: payload.payload?.content || '',
      type: ChatMessageType.USER_MESSAGE,
    },
    userId
  );
    // // Broadcast the message
    // await this.realTimeService.broadcastToSession(
    //   payload.sessionId,
    //   {
    //     ...payload,
    //     userId,
    //     timestamp: new Date().toISOString(),
    //   },
    //   userId // Exclude sender if needed
    // );
  }

  @SubscribeMessage('chat-message')
  async handleChatMessage(
    client: WebSocket,
    payload: ChatMessageDto,
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) return;

    // Process and broadcast chat message
    await this.realTimeService.handleChatMessage(payload, userId);
  }

  @SubscribeMessage('typing-indicator')
  async handleTypingIndicator(
    client: WebSocket,
    payload: TypingIndicatorDto,
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) return;

    // Broadcast typing indicator
    await this.realTimeService.broadcastTypingIndicator(payload, userId);
  }

  @SubscribeMessage('acknowledge-notification')
  async handleAcknowledgeNotification(
    client: WebSocket,
    payload: { notificationId: string },
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) return;

    await this.realTimeService.acknowledgeNotification(payload.notificationId, userId);
  }


  @SubscribeMessage('get-active-users')
  async handleGetActiveUsers(
    client: WebSocket,
    payload: { sessionId: string },
  ): Promise<void> {
    const userId = this.getClientUserId(client);
    if (!userId) {
      this.sendError(client, 'Not authenticated');
      return;
    }

    // Verify user has access to this session
    if (!this.realTimeService.isUserSubscribed(userId, payload.sessionId)) {
      this.sendError(client, 'Not subscribed to this session');
      return;
    }

    const activeUsers = this.realTimeService.getActiveUsers(payload.sessionId);

    // Use the service's sendToUser method
    this.realTimeService.sendToUser(userId, {
      type: 'ACTIVE_USERS',
      sessionId: payload.sessionId,
      activeUsers,
      timestamp: new Date(),
    });
  }

  // Helper method for sending errors directly to client
  private sendError(client: WebSocket, message: string, code?: string): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'ERROR',
        message,
        code,
        timestamp: new Date(),
      }));
    }
  }

  @SubscribeMessage('send-feedback')
  async handleSendFeedback(
    client: WebSocket,
    payload: {
      sessionId: string;
      targetUserId: string;
      severity: 'positive' | 'suggestion' | 'warning' | 'critical';
      message: string;
      context?: any;
    },
  ): Promise<void> {
    const senderId = this.getClientUserId(client);
    if (!senderId) return;

    // Verify sender has permission to send feedback (e.g., is supervisor)
    const userRole = this.getClientUserRole(client);
    if (!['SUPERVISOR', 'MEDICAL_EXPERT', 'ADMIN'].includes(userRole!)) {
      client.send(JSON.stringify({
        type: 'ERROR',
        message: 'Insufficient permissions to send feedback',
      }));
      return;
    }

    await this.realTimeService.sendRealTimeFeedback({
      ...payload,
      context: {
        ...payload.context,
        sentBy: senderId,
        sentByRole: userRole,
      },
    });
  }

  @SubscribeMessage('get-active-notifications')
async handleGetActiveNotifications(
  client: WebSocket,
  payload: { sessionId: string },
): Promise<void> {
  const userId = this.getClientUserId(client);
  if (!userId) {
    this.sendError(client, 'Not authenticated');
    return;
  }

  const activeNotifications = this.realTimeService.getActiveNotifications(payload.sessionId);
  
  this.realTimeService.sendToUser(userId, {
    type: 'ACTIVE_NOTIFICATIONS',
    sessionId: payload.sessionId,
    notifications: activeNotifications,
    timestamp: new Date(),
  });
}

@SubscribeMessage('dismiss-notification')
async handleDismissNotification(
  client: WebSocket,
  payload: { notificationId: string },
): Promise<void> {
  const userId = this.getClientUserId(client);
  if (!userId) {
    this.sendError(client, 'Not authenticated');
    return;
  }

  await this.realTimeService.dismissNotification(payload.notificationId, userId);
}

@SubscribeMessage('get-session-notifications')
async handleGetSessionNotifications(
  client: WebSocket,
  payload: { sessionId: string },
): Promise<void> {
  const userId = this.getClientUserId(client);
  if (!userId) {
    this.sendError(client, 'Not authenticated');
    return;
  }

  const notifications = this.realTimeService.getSessionNotifications(payload.sessionId);
  
  this.realTimeService.sendToUser(userId, {
    type: 'SESSION_NOTIFICATIONS',
    sessionId: payload.sessionId,
    notifications,
    timestamp: new Date(),
  });
}

  /**
   * Authenticates WebSocket client using JWT
   */
  private async authenticateClient(client: WebSocket, token: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      const userRole = payload.role;

      // Store user info in client (using a weak map or similar)
      (client as any).userId = userId;
      (client as any).userRole = userRole;

      this.realTimeService.handleConnection(userId, client, userRole);

      client.send(JSON.stringify({
        type: 'AUTHENTICATED',
        userId,
        role: userRole,
      }));

      console.log(`User ${userId} authenticated via WebSocket`);
    } catch (error) {
      client.close(1008, 'Invalid token');
    }
  }

  /**
   * Gets user ID from client
   */
  private getClientUserId(client: WebSocket): string | null {
    return (client as any).userId || null;
  }

  /**
   * Gets user role from client
   */
  private getClientUserRole(client: WebSocket): UserRole | null {
    return (client as any).userRole || null;
  }

}