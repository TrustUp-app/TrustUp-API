import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from '../../../../src/common/filters/http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockStatusFn: jest.Mock;
  let mockSendFn: jest.Mock;
  let mockGetResponse: jest.Mock;
  let mockGetRequest: jest.Mock;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockStatusFn = jest.fn().mockReturnThis();
    mockSendFn = jest.fn();

    mockGetResponse = jest.fn().mockReturnValue({
      status: mockStatusFn,
      send: mockSendFn,
    });

    mockGetRequest = jest.fn().mockReturnValue({
      url: '/api/v1/test',
      raw: { url: '/api/v1/test' },
    });

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: mockGetResponse,
        getRequest: mockGetRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should catch BadRequestException and format structured response', () => {
    const exception = new BadRequestException('Invalid payload');

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatusFn).toHaveBeenCalledWith(400);
    expect(mockSendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Invalid payload',
        error: 'Bad Request',
        path: '/api/v1/test',
      }),
    );
  });

  it('should catch NotFoundException and format response with string message', () => {
    const exception = new NotFoundException('Resource not found');

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatusFn).toHaveBeenCalledWith(404);
    expect(mockSendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Resource not found',
        error: 'Not Found',
        path: '/api/v1/test',
      }),
    );
  });

  it('should include error code if present in exception response object', () => {
    const exception = new BadRequestException({
      message: 'Custom error message',
      error: 'Bad Request',
      code: 'ERR_CUSTOM_CODE',
    });

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatusFn).toHaveBeenCalledWith(400);
    expect(mockSendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Custom error message',
        error: 'Bad Request',
        code: 'ERR_CUSTOM_CODE',
        path: '/api/v1/test',
      }),
    );
  });
});
