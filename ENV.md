# Environment Variables

Create a `.env` file in the project root (`TasksFlow/.env`) with the
following variables:

```
MYSQL_HOST=your_host
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
SESSION_SECRET=your_secret_key
PORT=5000
NODE_ENV=production
```

Notes:
- `PORT` should match the port your Node.js server listens on (default: 5000).
- `NODE_ENV=production` is required for static serving in production.
- `SESSION_SECRET` should be a long, random string.
