// src/real-time/real-time.service.ts
import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';
import { SessionsService } from '../sessions/sessions.service';
import {
  RealTimeMessageDto,
  ChatMessageDto,
  TypingIndicatorDto,
  BroadcastConfigDto,
  NotificationDto,
  NotificationStatus
} from './dto';

interface ConnectedUser {
  userId: string;
  socket: WebSocket;
  sessions: Set<string>;
  role: string;
  connectionTime: Date;
  lastActivity: Date;
}

@Injectable()
export class RealTimeService {
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private sessionSubscriptions: Map<string, Set<string>> = new Map();
  private notifications: Map<string, NotificationDto> = new Map();
  constructor() {
    this.startCleanupInterval();
  }
  // constructor(private sessionsService: SessionsService) {}

  /**
   * Handles user connection
   */
  handleConnection(userId: string, socket: WebSocket, role: string): void {
    const now = new Date();
    this.connectedUsers.set(userId, {
      userId,
      socket,
      sessions: new Set(),
      role,
      connectionTime: now,
      lastActivity: now,
    });

    console.log(`User ${userId} connected with role ${role}`);
  }

  /**
   * Handles user disconnection
   */
  handleDisconnection(userId: string): void {
    const user = this.connectedUsers.get(userId);
    if (user) {
      // Remove from session subscriptions
      for (const sessionId of user.sessions) {
        this.unsubscribeFromSession(userId, sessionId);
      }
      this.connectedUsers.delete(userId);
    }

    console.log(`User ${userId} disconnected`);
  }

  /**
   * Subscribes user to session updates
   */
  subscribeToSession(userId: string, sessionId: string): void {
    const user = this.connectedUsers.get(userId);
    if (!user) return;

    user.sessions.add(sessionId);
    user.lastActivity = new Date();

    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set());
    }
    this.sessionSubscriptions.get(sessionId)!.add(userId);

    console.log(`User ${userId} subscribed to session ${sessionId}`);
  }

  /**
   * Unsubscribes user from session updates
   */
  unsubscribeFromSession(userId: string, sessionId: string): void {
    const user = this.connectedUsers.get(userId);
    if (user) {
      user.sessions.delete(sessionId);
      user.lastActivity = new Date();
    }

    const sessionSubs = this.sessionSubscriptions.get(sessionId);
    if (sessionSubs) {
      sessionSubs.delete(userId);
      if (sessionSubs.size === 0) {
        this.sessionSubscriptions.delete(sessionId);
      }
    }

    console.log(`User ${userId} unsubscribed from session ${sessionId}`);
  }

  /**
   * Notifies about patient state changes
   */
  async notifyPatientStateUpdate(
    sessionId: string,
    patientState: any,
    changedBy?: string,
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'PATIENT_STATE_UPDATE',
      sessionId,
      patientState,
      timestamp: new Date(),
      changedBy,
    };

    this.broadcastToSubscribers(subscribers, message);
  }

  /**
   * Notifies about new orders
   */
  async notifyOrderCreated(
    sessionId: string,
    orderType: string,
    order: any,
    createdBy: string,
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'ORDER_CREATED',
      sessionId,
      orderType,
      order,
      createdBy,
      timestamp: new Date(),
    };

    this.broadcastToSubscribers(subscribers, message);
  }

  /**
   * Notifies about order status changes
   */
  async notifyOrderStatusChanged(
    sessionId: string,
    orderType: string,
    order: any,
    changedBy: string,
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'ORDER_STATUS_CHANGED',
      sessionId,
      orderType,
      order,
      changedBy,
      timestamp: new Date(),
    };

    this.broadcastToSubscribers(subscribers, message);
  }

  /**
   * Notifies about time events
   */
  async notifyTimeEvent(
    sessionId: string,
    event: any,
    virtualTime: Date,
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'TIME_EVENT',
      sessionId,
      event,
      virtualTime,
      timestamp: new Date(),
    };

    this.broadcastToSubscribers(subscribers, message);
  }

  /**
   * Notifies about session status changes
   */
  async notifySessionStatusChange(
    sessionId: string,
    status: string,
    changedBy: string,
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'SESSION_STATUS_CHANGE',
      sessionId,
      status,
      changedBy,
      timestamp: new Date(),
    };

    this.broadcastToSubscribers(subscribers, message);
  }

  /**
   * Notifies about real-time feedback
   */
  async notifyRealTimeFeedback(
    sessionId: string,
    feedback: any,
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'REAL_TIME_FEEDBACK',
      sessionId,
      feedback,
      timestamp: new Date(),
    };

    this.broadcastToSubscribers(subscribers, message);
  }

  /**
   * Sends direct message to specific user
   */
  sendToUser(userId: string, message: any): void {
    const user = this.connectedUsers.get(userId);
    if (user && user.socket.readyState === WebSocket.OPEN) {
      user.socket.send(JSON.stringify(message));
      user.lastActivity = new Date(); // Update activity on send
    }
  }

  /**
   * Broadcasts to all subscribers of a session
   */
  private broadcastToSubscribers(
    subscribers: Set<string>,
    message: any,
    excludeUserId?: string  // Make this optional
  ): void {
    for (const userId of subscribers) {
      if (userId !== excludeUserId) {  // Only send if not excluded
        this.sendToUser(userId, message);
      }
    }
  }

  /**
   * Gets connected users for a session
   */
  getSessionSubscribers(sessionId: string): string[] {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    return subscribers ? Array.from(subscribers) : [];
  }

  /**
   * Checks if user is connected and subscribed to session
   */
  isUserSubscribed(userId: string, sessionId: string): boolean {
    const user = this.connectedUsers.get(userId);
    return user ? user.sessions.has(sessionId) : false;
  }

  /**
    * Notifies when a user joins a session
    */
  async notifyUserJoined(sessionId: string, userId: string, userRole: string): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'USER_JOINED',
      sessionId,
      userId,
      userRole,
      timestamp: new Date(),
      activeUsers: this.getSessionSubscribers(sessionId).length,
    };

    this.broadcastToSubscribers(subscribers, message, userId); // Exclude the user who joined
  }

  /**
   * Notifies when a user leaves a session
   */
  async notifyUserLeft(sessionId: string, userId: string, userRole: string): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'USER_LEFT',
      sessionId,
      userId,
      userRole,
      timestamp: new Date(),
      activeUsers: this.getSessionSubscribers(sessionId).length - 1, // Subtract the leaving user
    };

    this.broadcastToSubscribers(subscribers, message);
  }

  /**
 * Broadcasts a message to all subscribers of a session
 */
  async broadcastToSession(
    sessionId: string,
    message: RealTimeMessageDto,
    excludeUserId?: string
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const broadcastMessage = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    };

    this.broadcastToSubscribers(subscribers, broadcastMessage, excludeUserId);
  }

  /**
   * Handles chat messages with proper routing
   */
  async handleChatMessage(chatMessage: ChatMessageDto, senderId: string): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(chatMessage.sessionId);
    if (!subscribers) return;

    const message = {
      type: 'CHAT_MESSAGE',
      sessionId: chatMessage.sessionId,
      senderId,
      content: chatMessage.content,
      messageType: chatMessage.type,
      timestamp: new Date(),
      context: chatMessage.context,
      isUrgent: chatMessage.isUrgent,
      replyTo: chatMessage.replyTo,
      messageId: this.generateMessageId(), // Generate unique ID for the message
    };

    // If targetUserId is specified, send only to that user (private message)
    if (chatMessage.targetUserId) {
      if (this.isUserSubscribed(chatMessage.targetUserId, chatMessage.sessionId)) {
        this.sendToUser(chatMessage.targetUserId, message);
        // Also send to sender for confirmation
        this.sendToUser(senderId, { ...message, isOwnMessage: true });
      }
    } else {
      // Broadcast to all subscribers except sender
      this.broadcastToSubscribers(subscribers, message, senderId);
      // Send to sender with isOwnMessage flag
      this.sendToUser(senderId, { ...message, isOwnMessage: true });
    }
  }

  /**
   * Broadcasts typing indicators
   */
  async broadcastTypingIndicator(typingData: TypingIndicatorDto, userId: string): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(typingData.sessionId);
    if (!subscribers) return;

    const message = {
      type: 'TYPING_INDICATOR',
      sessionId: typingData.sessionId,
      userId,
      isTyping: typingData.isTyping,
      target: typingData.target,
      context: typingData.context,
      timestamp: new Date(),
    };

    // Broadcast to all except the typing user
    this.broadcastToSubscribers(subscribers, message, userId);
  }

  /**
   * Creates and sends notifications
   */
  async sendNotification(notification: NotificationDto): Promise<string> {
    const notificationId = this.generateNotificationId();
    const now = new Date().toISOString();

    const fullNotification = {
      ...notification,
      id: notificationId,
      createdAt: now,
      status: notification.status || NotificationStatus.ACTIVE,
    };

    this.notifications.set(notificationId, fullNotification);

    // Send to target users
    if (notification.priority === 'critical') {
      // Send to all users in the session
      const subscribers = this.sessionSubscriptions.get(notification.sessionId);
      if (subscribers) {
        this.broadcastToSubscribers(subscribers, {
          type: 'NOTIFICATION',
          notification: fullNotification,
        });
      }
    } else {
      // Send based on user roles or specific users
      await this.sendTargetedNotification(fullNotification);
    }

    // Set auto-expiration if specified
    if (notification.autoExpireIn) {
      setTimeout(() => {
        this.expireNotification(notificationId);
      }, notification.autoExpireIn * 1000);
    }

    return notificationId;
  }

  /**
   * Acknowledges a notification
   */
  async acknowledgeNotification(notificationId: string, userId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.acknowledgedBy = userId;
      notification.acknowledgedAt = new Date().toISOString();
      notification.status = NotificationStatus.ACKNOWLEDGED;

      this.notifications.set(notificationId, notification);

      // Notify that notification was acknowledged
      const subscribers = this.sessionSubscriptions.get(notification.sessionId);
      if (subscribers) {
        this.broadcastToSubscribers(subscribers, {
          type: 'NOTIFICATION_ACKNOWLEDGED',
          notificationId,
          acknowledgedBy: userId,
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Sends real-time feedback to a specific user
   */
  async sendRealTimeFeedback(feedback: {
    sessionId: string;
    targetUserId: string;
    severity: 'positive' | 'suggestion' | 'warning' | 'critical';
    message: string;
    context?: any;
    suggestedActions?: string[];
  }): Promise<void> {
    const message = {
      type: 'REAL_TIME_FEEDBACK',
      sessionId: feedback.sessionId,
      feedback: {
        severity: feedback.severity,
        message: feedback.message,
        context: feedback.context,
        suggestedActions: feedback.suggestedActions,
        timestamp: new Date(),
      },
    };

    this.sendToUser(feedback.targetUserId, message);
  }

  /**
   * Updates connection status for a user
   */
  async updateConnectionStatus(
    userId: string,
    sessionId: string,
    status: 'connected' | 'disconnected' | 'reconnecting' | 'idle',
    connectionInfo?: any
  ): Promise<void> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const message = {
      type: 'CONNECTION_STATUS',
      sessionId,
      userId,
      status,
      timestamp: new Date(),
      connectionInfo,
    };

    this.broadcastToSubscribers(subscribers, message, userId);
  }

  /**
 * Dismisses a notification
 */
  async dismissNotification(notificationId: string, userId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.status = NotificationStatus.DISMISSED;
      this.notifications.set(notificationId, notification);

      // Notify about dismissal
      const subscribers = this.sessionSubscriptions.get(notification.sessionId);
      if (subscribers) {
        this.broadcastToSubscribers(subscribers, {
          type: 'NOTIFICATION_DISMISSED',
          notificationId,
          dismissedBy: userId,
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Gets active notifications for a session
   */
  getActiveNotifications(sessionId: string): (NotificationDto & { id: string })[] {
    const activeNotifications: (NotificationDto & { id: string })[] = [];

    for (const [id, notification] of this.notifications.entries()) {
      if (notification.sessionId === sessionId && notification.status === NotificationStatus.ACTIVE) {
        activeNotifications.push({ ...notification, id });
      }
    }

    return activeNotifications;
  }

  /**
   * Gets all notifications for a session
   */
  getSessionNotifications(sessionId: string): (NotificationDto & { id: string })[] {
    const sessionNotifications: (NotificationDto & { id: string })[] = [];

    for (const [id, notification] of this.notifications.entries()) {
      if (notification.sessionId === sessionId && notification.status === NotificationStatus.ACTIVE) {
        sessionNotifications.push({ ...notification, id });
      }
    }

    return sessionNotifications.sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  /**
   * Gets active users in a session
   */
  getActiveUsers(sessionId: string): Array<{
    userId: string;
    role: string;
    connectionTime: Date;
    lastActivity: Date;
  }> {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return [];

    return Array.from(subscribers)
      .map(userId => {
        const user = this.connectedUsers.get(userId);
        return user ? {
          userId: user.userId,
          role: user.role,
          connectionTime: user.connectionTime,
          lastActivity: user.lastActivity,
        } : null;
      })
      .filter(Boolean) as any[];
  }

  // ========== PRIVATE METHODS ==========
  /**
   * Updates notification properties safely
   */
  private updateNotification(notificationId: string, updates: Partial<NotificationDto>): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      this.notifications.set(notificationId, { ...notification, ...updates });
    }
  }
  
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async sendTargetedNotification(notification: NotificationDto & { id: string }): Promise<void> {
    // Implementation for sending notifications to specific user roles
    const subscribers = this.sessionSubscriptions.get(notification.sessionId);
    if (!subscribers) return;

    // For now, send to all subscribers - you can add role-based filtering here
    this.broadcastToSubscribers(subscribers, {
      type: 'NOTIFICATION',
      notification,
    });
  }

  private expireNotification(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification && notification.status === 'active') {
      notification.status = NotificationStatus.EXPIRED;
      this.notifications.set(notificationId, notification);

      // Notify about expiration
      const subscribers = this.sessionSubscriptions.get(notification.sessionId);
      if (subscribers) {
        this.broadcastToSubscribers(subscribers, {
          type: 'NOTIFICATION_EXPIRED',
          notificationId,
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Updates user activity timestamp
   */
  private updateUserActivity(userId: string): void {
    const user = this.connectedUsers.get(userId);
    if (user) {
      user.lastActivity = new Date();
    }
  }

  /**
   * Checks for inactive connections and cleans them up
   */
  private cleanupInactiveConnections(): void {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [userId, user] of this.connectedUsers.entries()) {
      if (now.getTime() - user.lastActivity.getTime() > inactiveThreshold) {
        // User is inactive, disconnect them
        user.socket.close(1000, 'Inactive connection');
        this.handleDisconnection(userId);
      }
    }
  }

  // Start cleanup interval (run every minute)
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 60 * 1000);
  }


}