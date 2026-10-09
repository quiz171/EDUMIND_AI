## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```sh
   npm install
   ```
2. Copy `.env.example` to `.env` and set the values you need. At minimum, set `GEMINI_API_KEY` for AI features.
3. Start the app:
   ```sh
   npm run dev
   ```

## Email verification codes

To send signup verification and password-reset codes through Gmail, configure these variables in `.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-16-character-google-app-password
EMAIL_FROM=your-gmail-address@gmail.com
```

Create a Google App Password from your Google Account's **Security → 2-Step Verification → App passwords** settings. Use the App Password, not your regular Google password. The app removes spaces from the password automatically. When Gmail is configured, `GMAIL_APP_PASSWORD` takes precedence over `SMTP_PASS`.

Keep `.env` private: it contains credentials and must not be committed. For hosted deployments, configure these values as environment variables in the hosting provider and redeploy the app.

If codes are not arriving, check the server output after requesting one. Successful delivery is logged as `Email successfully delivered`; an SMTP authentication or connection error is logged when delivery fails. Also check Spam/Junk. A successful SMTP handoff confirms the mail provider accepted the message, but does not guarantee inbox placement.

## Validation

```sh
npm run lint
npm run build
```
