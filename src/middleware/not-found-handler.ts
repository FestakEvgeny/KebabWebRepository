import { Request, Response } from 'express';
import { sendErrorResponse } from './send-error-response';

export function notFoundHandler(req: Request, res: Response): void {
  sendErrorResponse(req, res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
}
