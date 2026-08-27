/** Type augmentation for the authenticated user attached by the auth middleware. */
export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        display_name: string;
        created_at: string;
        is_admin?: number;
      };
    }
  }
}
