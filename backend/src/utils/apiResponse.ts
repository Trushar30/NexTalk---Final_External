import { Response } from 'express';
import { ApiResponse, PaginationMeta } from '../types';

export function sendSuccess<T>(res: Response, data?: T, message?: string, statusCode = 200, meta?: PaginationMeta): void {
  const response: ApiResponse<T> = { success: true };
  if (data !== undefined) response.data = data;
  if (message) response.message = message;
  if (meta) response.meta = meta;
  res.status(statusCode).json(response);
}

export function sendError(res: Response, error: string, statusCode = 400): void {
  res.status(statusCode).json({ success: false, error } as ApiResponse);
}

export function sendCreated<T>(res: Response, data?: T, message?: string): void {
  sendSuccess(res, data, message, 201);
}
