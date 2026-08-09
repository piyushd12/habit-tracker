import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, timezoneSchema } from '../middleware/validators.js';
import { ConflictError, UnauthorizedError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import {
  generateRefreshTokenValue,
  getRefreshTokenExpiry,
  hashRefreshToken,
} from '../utils/tokens.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('⚠️  WARNING: Using default JWT_SECRET in development. Set JWT_SECRET in production!');
}

const JWT_SECRET_FINAL = JWT_SECRET || 'habit-tracker-super-secret-key-12345-very-long-and-secure';

const generateAccessToken = (userId: string, email: string, timezone: string): string => {
  return jwt.sign({ id: userId, email, timezone }, JWT_SECRET_FINAL, { expiresIn: '15m' });
};

const setRefreshTokenCookie = (res: Response, token: string) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const issueSessionTokens = async (
  res: Response,
  user: { id: string; email: string; timezone: string }
): Promise<string> => {
  const accessToken = generateAccessToken(user.id, user.email, user.timezone);
  const refreshToken = generateRefreshTokenValue();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: getRefreshTokenExpiry(),
    },
  });

  setRefreshTokenCookie(res, refreshToken);
  return accessToken;
};

const revokeRefreshToken = async (token: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({
    where: { tokenHash: hashRefreshToken(token) },
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

      const hashedPassword = await bcrypt.hash(password, 12);

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

      const accessToken = await issueSessionTokens(res, user);

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

      const accessToken = await issueSessionTokens(res, user);

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
  const refreshToken = req.cookies?.refreshToken as string | undefined;

  if (!refreshToken) {
    return next(new UnauthorizedError('Refresh token is missing'));
  }

  try {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await revokeRefreshToken(refreshToken);
      }
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Rotate refresh token on each use
    await revokeRefreshToken(refreshToken);
    const accessToken = await issueSessionTokens(res, storedToken.user);

    res.status(200).json({
      status: 'success',
      data: {
        accessToken,
        user: {
          id: storedToken.user.id,
          email: storedToken.user.email,
          timezone: storedToken.user.timezone,
        },
      },
    });
  } catch (error) {
    next(error instanceof UnauthorizedError ? error : new UnauthorizedError('Invalid or expired refresh token'));
  }
});

// POST /logout
router.post('/logout', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
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
router.put(
  '/timezone',
  requireAuth,
  validate(timezoneSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { timezone } = req.body as { timezone: string };

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
  }
);

export default router;
