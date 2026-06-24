import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Custom NestJS Pipe that validates incoming data against a Zod Schema.
 * Formats errors to match standard class-validator ValidationPipe structures.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      const parsedValue = this.schema.parse(value);
      return parsedValue;
    } catch (error: any) {
      const formattedErrors = error.errors?.map(
        (err: any) => `${err.path.join('.')}: ${err.message}`
      ) || [error.message];

      throw new BadRequestException({
        statusCode: 400,
        message: formattedErrors,
        error: 'Bad Request',
      });
    }
  }
}
