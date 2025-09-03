/**
 * Request validation middleware using Joi
 */

import { Request, Response, NextFunction } from 'express';
import Joi, { Schema } from 'joi';

interface ValidationSchemas {
  body?: Schema;
  params?: Schema;
  query?: Schema;
}

/**
 * Create validation middleware for request validation
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      if (schemas.body) {
        const { error } = schemas.body.validate(req.body);
        if (error) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid request body',
            details: error.details.map(d => ({
              field: d.path.join('.'),
              message: d.message
            }))
          });
        }
      }

      // Validate request parameters
      if (schemas.params) {
        const { error } = schemas.params.validate(req.params);
        if (error) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid request parameters',
            details: error.details.map(d => ({
              field: d.path.join('.'),
              message: d.message
            }))
          });
        }
      }

      // Validate query parameters
      if (schemas.query) {
        const { error } = schemas.query.validate(req.query);
        if (error) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid query parameters',
            details: error.details.map(d => ({
              field: d.path.join('.'),
              message: d.message
            }))
          });
        }
      }

      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Validation failed'
      });
    }
  };
}

// Common validation schemas
export const commonSchemas = {
  // Discord ID validation
  discordId: Joi.string().pattern(/^\d+$/).min(10).max(20).required(),
  
  // Spotify URI validation
  spotifyUri: Joi.string().pattern(/^spotify:(track|album|playlist):[a-zA-Z0-9]+$/).required(),
  
  // Pagination
  pagination: {
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  },

  // Raid ID
  raidId: Joi.string().pattern(/^\d+$/).required(),

  // Device ID (optional)
  deviceId: Joi.string().optional(),

  // Solana public key
  publicKey: Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).required(),

  // Wallet address
  walletAddress: Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).required(),

  // Token amount (as string to preserve precision)
  tokenAmount: Joi.string().pattern(/^\d+(\.\d+)?$/).required()
};