import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  STELLAR_WALLET_REGEX,
  STELLAR_WALLET_INVALID_MESSAGE,
} from '../../../common/constants/stellar';

/**
 * DTO for requesting a nonce for wallet signature authentication.
 * Validates Stellar Ed25519 public key format (G + 55 base32 characters).
 */
export class NonceRequestDto {
  @ApiProperty({
    description: 'Stellar wallet address (Ed25519 public key, G + 55 chars)',
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
    minLength: 56,
    maxLength: 56,
  })
  @IsString()
  @IsNotEmpty({ message: 'Wallet address is required' })
  @Matches(STELLAR_WALLET_REGEX, { message: STELLAR_WALLET_INVALID_MESSAGE })
  wallet: string;
}
