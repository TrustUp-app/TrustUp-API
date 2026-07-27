import { ArgumentsHost, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from '../../../../src/common/filters/all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockStatusFn: jest.Mock;
  let mockSendFn: jest.Mock;
  let mockGetResponse: jest.Mock;
  let mockGetRequest: jest.Mock;
  let mockArgumentsHost: ArgumentsHost;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockStatusFn = jest.fn().mockReturnThis();
    mockSendFn = jest.fn();

    mockGetResponse = jest.fn().mockReturnValue({
      status: mockStatusFn,
      send: mockSendFn,
    });

    mockGetRequest = jest.fn().mockReturnValue({
      method: 'GET',
      url: '/api/v1/unknown',
      raw: { url: '/api/v1/unknown' },
    });

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: mockGetResponse,
        getRequest: mockGetRequest,
      }),
    } as unknown as ArgumentsHost;

    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should catch generic Error, log it, and return 500 without leaking stack trace', () => {
    const internalError = new Error('Database query crash');

    filter.catch(internalError, mockArgumentsHost);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled exception on GET /api/v1/unknown: Database query crash'),
      internalError.stack,
    );

    expect(mockStatusFn).toHaveBeenCalledWith(500);
    expect(mockSendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        path: '/api/v1/unknown',
      }),
    );

    const sentPayload = mockSendFn.mock.calls[0][0];
    expect(sentPayload.stack).toBeUndefined();
  });

  it('should handle non-Error thrown values gracefully', () => {
    const rawStringError = 'Unknown primitive error';

    filter.catch(rawStringError, mockArgumentsHost);

    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(mockStatusFn).toHaveBeenCalledWith(500);
    expect(mockSendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        path: '/api/v1/unknown',
      }),
    );
  });
});
