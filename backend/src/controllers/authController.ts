import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, username: inputUsername } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    let username = '';

    // If an input username is provided, sanitize and check if it is taken
    if (inputUsername && typeof inputUsername === 'string' && inputUsername.trim().length >= 3) {
      const sanitized = inputUsername.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 26);
      
      const usernameExists = await prisma.user.findFirst({
        where: { username: { equals: sanitized, mode: 'insensitive' } },
      });
      
      if (usernameExists) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      
      username = sanitized;
    } else {
      // Auto-generate username from email prefix
      const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 26);
      username = emailPrefix.length >= 3 ? emailPrefix : emailPrefix + '___'.slice(0, 3 - emailPrefix.length);

      // Check if username is taken; if so, append random 4-digit suffix
      const usernameExists = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
      });
      if (usernameExists) {
        username = `${emailPrefix.slice(0, 26)}${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    // Create user with auto-generated username
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        username,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Generate JWT
    const secret = process.env.JWT_SECRET || 'fallback_development_secret';
    const token = jwt.sign({ id: newUser.id }, secret, {
      expiresIn: '1d',
    });

    return res.status(201).json({ user: newUser, token });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET || 'fallback_development_secret';
    const token = jwt.sign({ id: user.id }, secret, {
      expiresIn: '1d',
    });

    // Build user response with profile fields
    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };

    return res.status(200).json({ user: userResponse, token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
