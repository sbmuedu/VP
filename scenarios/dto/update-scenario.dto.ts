import { PartialType } from '@nestjs/mapped-types';
import { CreateScenarioDto } from './create-scenario.dto';

/**
 * Data Transfer Object for updating existing scenarios
 * All fields are optional for partial updates
 */
export class UpdateScenarioDto extends PartialType(CreateScenarioDto) {}