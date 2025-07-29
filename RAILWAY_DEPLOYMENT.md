# Deploying to Railway

This guide provides step-by-step instructions for deploying the Audius Discord Bot to Railway.

## Prerequisites

1. A Railway account (https://railway.app)
2. Your Discord bot token and client ID
3. Your Audius API key and secret
4. A PostgreSQL database (can be created on Railway)

## Deployment Steps

### 1. Create a New Project in Railway

1. Log in to your Railway account
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account if not already connected
5. Select the repository containing your Audius Discord Bot

### 2. Add a PostgreSQL Database

1. In your project dashboard, click "New"
2. Select "Database" and then "PostgreSQL"
3. Wait for the database to be provisioned

### 3. Configure Environment Variables

In your project settings, add the following environment variables:

```
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
GUILD_ID=your_discord_server_id
ADMIN_DISCORD_ID=your_discord_user_id
AUDIUS_API_KEY=your_audius_api_key
AUDIUS_API_SECRET=your_audius_api_secret
OAUTH_CALLBACK_URL=your_oauth_callback_url
PORT=3000
DEFAULT_RAID_DURATION=60
MINIMUM_LISTEN_TIME=60
NODE_ENV=production
```

The `DATABASE_URL` will be automatically set by Railway when you add the PostgreSQL database.

### 4. Deploy the Application

1. Railway will automatically deploy your application when you push changes to your GitHub repository
2. You can also manually deploy by clicking the "Deploy" button in your project dashboard

### 5. Verify Deployment

1. Check the deployment logs to ensure there are no errors
2. Test the bot by inviting it to your Discord server and using the commands

## Troubleshooting

### Common Issues

#### Database Connection Errors

- Ensure the `DATABASE_URL` environment variable is correctly set
- Check if your IP is allowed to access the database
- Verify that the database schema has been properly created with Prisma

#### Audius SDK Errors

- Ensure both `AUDIUS_API_KEY` and `AUDIUS_API_SECRET` are correctly set
- The `appName` parameter is required by the Audius SDK and is set in the code

#### Discord Bot Not Responding

- Verify that the `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are correct
- Ensure the bot has been invited to your Discord server with the correct permissions
- Check if the bot is online in your Discord server

## Monitoring and Logs

Railway provides built-in logging and monitoring tools:

1. Navigate to your project dashboard
2. Click on the "Deployments" tab
3. Select the current deployment
4. Click on "Logs" to view the application logs

## Scaling

Railway automatically scales your application based on usage. If you need to manually adjust resources:

1. Go to your project settings
2. Click on the "Usage" tab
3. Adjust the CPU, RAM, and other resources as needed