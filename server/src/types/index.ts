import { Request } from 'express';

export interface UserPayload {
  id: string;
  email: string;
  timezone: string;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}
