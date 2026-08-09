import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../middleware/validators.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'habit-tracker-super-secret-key-12345-very-long-and-secure';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'habit-tracker-refresh-super-secret-key-67890';

// Helper to generate access token
const generateAccessToken = (userId: string, email: string, timezone: string): string => {
  return jwt.sign({ id: userId, email, timezone }, JWT_SECRET, { expiresIn: '15m' });
};

// Helper to generate refresh token
const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ id: userId }, REFRESH_SECRET, { expiresIn: '7d' });
};

// Set refresh token cookie helper
const setRefreshTokenCookie = (res: Response, token: string) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// POST /register
router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { email, password, timezone } = req.body;

    try {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        throw new ConflictError('Email address is already in use');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user along with default reminder settings (enabled at 20:00 local time)
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          timezone,
          reminderSettings: {
            create: {
              time: '20:00',
              enabled: true,
            },
          },
        },
      });

      const accessToken = generateAccessToken(user.id, user.email, user.timezone);
      const refreshToken = generateRefreshToken(user.id);

      setRefreshTokenCookie(res, refreshToken);

      res.status(201).json({
        status: 'success',
        data: {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            timezone: user.timezone,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /login
router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { email, password } = req.body;

    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const accessToken = generateAccessToken(user.id, user.email, user.timezone);
      const refreshToken = generateRefreshToken(user.id);

      setRefreshTokenCookie(res, refreshToken);

      res.status(200).json({
        status: 'success',
        data: {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            timezone: user.timezone,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Grab refresh token from cookies
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return next(new UnauthorizedError('Refresh token is missing'));
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as { id: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const accessToken = generateAccessToken(user.id, user.email, user.timezone);

    res.status(200).json({
      status: 'success',
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          timezone: user.timezone,
        },
      },
    });
  } catch (error) {
    next(new UnauthorizedError('Invalid or expired refresh token'));
  }
});

// POST /logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
});

// GET /me
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, timezone: true, createdAt: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /timezone
router.put('/timezone', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { timezone } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { timezone },
    });

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          timezone: user.timezone,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
