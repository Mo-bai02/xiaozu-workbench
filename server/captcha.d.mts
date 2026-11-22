export interface CaptchaChallenge {
  id: string;
  /** data:image/svg+xml;base64,... */
  image: string;
}

export function issueCaptcha(): CaptchaChallenge;
export function verifyCaptcha(id: string, input: string): boolean;
