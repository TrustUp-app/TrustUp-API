import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

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
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map(
          (err) => `${err.path.join('.')}: ${err.message}`
        );

        throw new BadRequestException({
          statusCode: 400,
          message: formattedErrors,
          error: 'Bad Request',
        });
      }
      
      throw new BadRequestException('Validation failed');
    }
  }
}
