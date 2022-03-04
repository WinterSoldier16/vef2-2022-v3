import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import passport from './lib/login.js';
import {
  comparePasswords, createUser, findById, findByUsername, listAllUsers
} from './lib/users.js';

dotenv.config();

const {
  PORT: port = 4000,
  JWT_SECRET: jwtSecret,
  TOKEN_LIFETIME: tokenLifetime = 200,
  SESSION_SECRET: sessionSecret,
  DATABASE_URL: databaseUrl,
} = process.env;

if (!jwtSecret || !databaseUrl) {
  console.error('Vantar gögn í env');
  process.exit(1);
}

const app = express();

// Sér um að req.body innihaldi gögn úr formi
app.use(express.json());

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: jwtSecret,
}

async function strat(data, next) {
  // fáum id gegnum data sem geymt er í token
  const user = await findById(data.id);

  if (user) {
    next(null, user);
  } else {
    next(null, false);
  }
}

passport.use(new Strategy(jwtOptions, strat));

app.use(passport.initialize());

app.get('/', (req, res) => {
  res.json({
    login: '/login',
    admin: '/admin',
    users: '/users'
  });
});

app.post('/users/login', async (req, res) => {
  const { username, password = '' } = req.body;

  const user = await findByUsername(username);

  if (!user) {
    return res.status(401).json({ error: 'No such user' });
  }

  const passwordIsCorrect = await comparePasswords(password, user.password);

  if (passwordIsCorrect) {
    const payload = { id: user.id };
    const tokenOptions = { expiresIn: tokenLifetime };
    const token = jwt.sign(payload, jwtOptions.secretOrKey, tokenOptions);
    return res.json({ token });
  }

  return res.status(401).json({ error: 'Invalid password' });
});

function requireAuthentication(req, res, next) {
  return passport.authenticate(
    'jwt',
    { session: false },
    (err, user, info) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        const error = info.name === 'TokenExpiredError'
          ? 'expired token' : 'invalid token';

        return res.status(401).json({ error });
      }

      // Látum notanda vera aðgengilegan í rest af middlewares
      req.user = user;
      return next();
    },
  )(req, res, next);
}
// app.use('/admin', adminRouter);
app.get('/admin', requireAuthentication, (req, res) => {
  res.json({ data: 'top secret' });
});

app.get('/users', async (req, res) => {
  const { username = '' } = req.body;
  const allUsers = await findByUsername(username);
  if (!allUsers) {
    return res.status(401).json({ error: 'Please signup at /register before continuing' });
  }
  if (allUsers.admin === true) {
    const listOfAllUsers = await listAllUsers();
    return res.json({ listOfAllUsers });
  }
  return res.status(401).json({ error: 'Need admin privileges to continue' });
});

app.post('/users/register', async (req, res) => {
  const { name, username, password = '' } = req.body;

  if (!name || !username || !password) {
    return res.status(401).json({ error: 'Please provide name, username and password' });
  }
  const createdUser = await createUser(name, username, password, false);

  if (createdUser) {
    return res.json({ name, username });
  }
  return res.json({ data: 'User was not created, please try again with different username' });
});

app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  const userId = await findById(id);

  if (!userId) {
    return res.status(401).json({ error: 'Please signup at /register before continuing' });
  }
  const usera = req.user;
  console.error(usera);
  if (usera.admin === true) {
    return res.json({ userId });
  }


  return res.status(401).json({ error: 'Need admin privleges to continue' });
});

function notFoundHandler(req, res, next) { // eslint-disable-line
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, next) { // eslint-disable-line
  console.error(err);

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid json' });
  }

  return res.status(500).json({ error: 'Internal server error' });
}

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.info(`Server running at http://localhost:${port}/`);
});
