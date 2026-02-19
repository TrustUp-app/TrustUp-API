import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoansController } from '../../../../src/modules/loans/loans.controller';
import { LoansService } from '../../../../src/modules/loans/loans.service';
import { LoanQuoteRequestDto } from '../../../../src/modules/loans/dto/loan-quote-request.dto';
import { LoanQuoteResponseDto } from '../../../../src/modules/loans/dto/loan-quote-response.dto';

describe('LoansController', () => {
  let controller: LoansController;
  let loansService: LoansService;

  const mockLoansService = {
    calculateLoanQuote: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoansController],
      providers: [
        { provide: LoansService, useValue: mockLoansService },
        { provide: JwtService, useValue: { verify: jest.fn() } },
      ],
    }).compile();

    controller = module.get<LoansController>(LoansController);
    loansService = module.get<LoansService>(LoansService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getQuote', () => {
    const wallet = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';
    const dto: LoanQuoteRequestDto = {
      amount: 500,
      merchant: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      term: 4,
    };

    it('should return a loan quote for valid input', async () => {
      const expectedResponse: LoanQuoteResponseDto = {
        amount: 500,
        guarantee: 100,
        loanAmount: 400,
        interestRate: 8,
        totalRepayment: 410.67,
        term: 4,
        schedule: [
          { paymentNumber: 1, amount: 102.67, dueDate: '2026-03-13T00:00:00.000Z' },
          { paymentNumber: 2, amount: 102.67, dueDate: '2026-04-13T00:00:00.000Z' },
          { paymentNumber: 3, amount: 102.67, dueDate: '2026-05-13T00:00:00.000Z' },
          { paymentNumber: 4, amount: 102.66, dueDate: '2026-06-13T00:00:00.000Z' },
        ],
      };

      mockLoansService.calculateLoanQuote.mockResolvedValue(expectedResponse);

      const result = await controller.getQuote(wallet, dto);

      expect(result).toEqual(expectedResponse);
      expect(loansService.calculateLoanQuote).toHaveBeenCalledWith(wallet, dto);
      expect(loansService.calculateLoanQuote).toHaveBeenCalledTimes(1);
    });

    it('should propagate NotFoundException from service', async () => {
      mockLoansService.calculateLoanQuote.mockRejectedValue(
        new NotFoundException({
          code: 'MERCHANT_NOT_FOUND',
          message: 'Merchant not found',
        }),
      );

      await expect(controller.getQuote(wallet, dto)).rejects.toThrow(NotFoundException);
    });

    it('should propagate BadRequestException from service', async () => {
      mockLoansService.calculateLoanQuote.mockRejectedValue(
        new BadRequestException({
          code: 'LOAN_EXCEEDS_MAX_CREDIT',
          message: 'Amount exceeds max credit',
        }),
      );

      await expect(controller.getQuote(wallet, dto)).rejects.toThrow(BadRequestException);
    });
  });
});
