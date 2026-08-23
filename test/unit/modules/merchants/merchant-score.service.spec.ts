import { Test, TestingModule } from '@nestjs/testing';
import { MerchantScoreService } from '../../../../src/modules/merchants/merchant-score.service';

describe('MerchantScoreService', () => {
    let service: MerchantScoreService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [MerchantScoreService],
        }).compile();

        service = module.get<MerchantScoreService>(MerchantScoreService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('aggregateLoans', () => {
        it('should return all zeros for an empty loan list', () => {
            const result = service.aggregateLoans([]);

            expect(result).toEqual({
                totalLoans: 0,
                activeLoans: 0,
                completedLoans: 0,
                defaultedLoans: 0,
                totalVolume: 0,
                outstandingBalance: 0,
                repaymentRate: 0,
                defaultRate: 0,
            });
        });

        it('should count loans by status and sum volume/outstanding balance correctly', () => {
            const result = service.aggregateLoans([
                { loan_amount: 400, remaining_balance: 200, status: 'active' },
                { loan_amount: 300, remaining_balance: 0, status: 'completed' },
                { loan_amount: 500, remaining_balance: 500, status: 'defaulted' },
                { loan_amount: 100, remaining_balance: 100, status: 'active' },
            ]);

            expect(result.totalLoans).toBe(4);
            expect(result.activeLoans).toBe(2);
            expect(result.completedLoans).toBe(1);
            expect(result.defaultedLoans).toBe(1);
            expect(result.totalVolume).toBe(1300);
            expect(result.outstandingBalance).toBe(300);
        });

        it('should compute repaymentRate as completedLoans / totalLoans * 100', () => {
            const result = service.aggregateLoans([
                { loan_amount: 100, remaining_balance: 0, status: 'completed' },
                { loan_amount: 100, remaining_balance: 0, status: 'completed' },
                { loan_amount: 100, remaining_balance: 0, status: 'completed' },
                { loan_amount: 100, remaining_balance: 100, status: 'defaulted' },
            ]);

            expect(result.repaymentRate).toBe(75);
            expect(result.defaultRate).toBe(25);
        });

        it('should ignore pending loans when counting active/completed/defaulted but still count them in totalLoans and volume', () => {
            const result = service.aggregateLoans([
                { loan_amount: 100, remaining_balance: 100, status: 'pending' },
                { loan_amount: 200, remaining_balance: 0, status: 'completed' },
            ]);

            expect(result.totalLoans).toBe(2);
            expect(result.totalVolume).toBe(300);
            expect(result.activeLoans).toBe(0);
            expect(result.completedLoans).toBe(1);
        });

        it('should coerce string numeric values from the database into numbers', () => {
            const result = service.aggregateLoans([
                { loan_amount: '150.5', remaining_balance: '75.25', status: 'active' },
            ]);

            expect(result.totalVolume).toBe(150.5);
            expect(result.outstandingBalance).toBe(75.25);
        });
    });

    describe('calculateScore', () => {
        it('should return score 0 and tier poor when there are no loans', () => {
            const result = service.calculateScore(
                service.aggregateLoans([]),
            );

            expect(result).toEqual({ score: 0, tier: 'poor' });
        });

        it('should assign tier gold to a merchant with a perfect repayment record and high volume', () => {
            const loans = Array.from({ length: 20 }, () => ({
                loan_amount: 1000,
                remaining_balance: 0,
                status: 'completed' as const,
            }));

            const { score, tier } = service.calculateScore(service.aggregateLoans(loans));

            expect(tier).toBe('gold');
            expect(score).toBeGreaterThanOrEqual(90);
        });

        it('should assign tier poor to a merchant whose loans mostly default', () => {
            const loans = [
                { loan_amount: 100, remaining_balance: 100, status: 'defaulted' },
                { loan_amount: 100, remaining_balance: 100, status: 'defaulted' },
                { loan_amount: 100, remaining_balance: 100, status: 'defaulted' },
                { loan_amount: 100, remaining_balance: 0, status: 'completed' },
            ];

            const { score, tier } = service.calculateScore(service.aggregateLoans(loans));

            expect(tier).toBe('poor');
            expect(score).toBeLessThan(60);
        });

        it('should never return a score below 0 or above 100', () => {
            const manyDefaults = Array.from({ length: 10 }, () => ({
                loan_amount: 100,
                remaining_balance: 100,
                status: 'defaulted' as const,
            }));

            const { score } = service.calculateScore(service.aggregateLoans(manyDefaults));

            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
        });
    });
});
