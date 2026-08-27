import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STELLAR_WALLET_REGEX, STELLAR_WALLET_INVALID_MESSAGE } from '../../../common/constants/stellar';

/**
 * DTO for verifying a Stellar wallet signature and issuing JWT tokens.
 * The client must first request a nonce via POST /auth/nonce, sign it
 * with their wallet private key, then submit it here.
 */
export class VerifyRequestDto {
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

  @ApiProperty({
    description: 'Nonce obtained from POST /auth/nonce (64 lowercase hexadecimal characters)',
    example: 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty({ message: 'Nonce is required' })
  @Length(64, 64, { message: 'Nonce must be exactly 64 characters' })
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Nonce must be 64 lowercase hexadecimal characters',
  })
  nonce: string;

  @ApiProperty({
    description:
      'Base64-encoded Ed25519 signature of the nonce bytes, signed with the wallet private key',
    example: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  })
  @IsString()
  @IsNotEmpty({ message: 'Signature is required' })
  signature: string;
}
