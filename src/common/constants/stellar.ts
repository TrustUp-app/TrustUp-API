/**
 * Stellar Ed25519 public key format: 'G' followed by 55 base32 characters
 * (RFC 4648 alphabet without padding: A-Z and 2-7).
 */
export const STELLAR_WALLET_REGEX = /^G[A-Z2-7]{55}$/;

export const STELLAR_WALLET_INVALID_MESSAGE =
  'Invalid Stellar wallet address. Must start with G and have 55 base32 characters [A-Z2-7]';
