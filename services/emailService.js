const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Configure based on environment variables
    const emailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    };

    // For development/testing without email credentials
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      console.log('⚠️  Email service: Using test mode (no real emails will be sent)');
      console.log('⚠️  To enable real emails, set SMTP_USER and SMTP_PASSWORD environment variables');
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport(emailConfig);

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('Email service configuration error:', error);
      } else {
        console.log('✅ Email service ready');
      }
    });
  }

  async sendPasswordResetEmail(email, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || '"SNK Properties" <noreply@snkproperties.com>',
      to: email,
      subject: 'Password Reset Request - SNK Properties',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #8BC83F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #8BC83F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SNK Properties</h1>
              <h2>Password Reset Request</h2>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>We received a request to reset your password for your SNK Properties account associated with <strong>${email}</strong>.</p>
              
              <p>Click the button below to reset your password:</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #e9ecef; padding: 10px; border-radius: 4px;">${resetUrl}</p>
              
              <div class="warning">
                <strong>Important:</strong>
                <ul>
                  <li>This link will expire in 1 hour for security reasons</li>
                  <li>If you didn't request this password reset, please ignore this email</li>
                  <li>Never share this link with anyone</li>
                </ul>
              </div>
              
              <p>If you're having trouble with the button above, copy and paste the URL into your web browser.</p>
              
              <p>Best regards,<br>SNK Properties Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; 2024 SNK Properties. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request - SNK Properties
        
        Hello,
        
        We received a request to reset your password for your SNK Properties account associated with ${email}.
        
        To reset your password, please visit the following link:
        ${resetUrl}
        
        Important:
        - This link will expire in 1 hour for security reasons
        - If you didn't request this password reset, please ignore this email
        - Never share this link with anyone
        
        Best regards,
        SNK Properties Team
        
        This is an automated email. Please do not reply to this message.
      `
    };

    try {
      if (!this.transporter) {
        // In test mode, just log the email content
        console.log('📧 [TEST MODE] Password reset email would be sent to:', email);
        console.log('📧 Reset URL:', resetUrl);
        console.log('📧 Reset Token:', resetToken);
        return { success: true, messageId: 'test-mode' };
      }

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Password reset email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendWelcomeEmail(email, fullName) {
    const mailOptions = {
      from: process.env.FROM_EMAIL || '"SNK Properties" <noreply@snkproperties.com>',
      to: email,
      subject: 'Welcome to SNK Properties!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to SNK Properties</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #8BC83F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to SNK Properties!</h1>
            </div>
            <div class="content">
              <p>Dear ${fullName},</p>
              <p>Welcome to SNK Properties! We're excited to have you join our community of property enthusiasts.</p>
              
              <p>Your account has been successfully created with the email: <strong>${email}</strong></p>
              
              <p>You can now:</p>
              <ul>
                <li>Browse our extensive property listings</li>
                <li>Save your favorite properties</li>
                <li>Contact property brokers directly</li>
                <li>List your own properties</li>
                <li>Access exclusive premium features</li>
              </ul>
              
              <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
              
              <p>Happy property hunting!</p>
              
              <p>Best regards,<br>SNK Properties Team</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 SNK Properties. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      if (!this.transporter) {
        console.log('📧 [TEST MODE] Welcome email would be sent to:', email);
        return { success: true, messageId: 'test-mode' };
      }

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Welcome email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send welcome email:', error);
      // Don't throw error for welcome email failure
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();