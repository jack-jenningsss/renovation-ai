const cron = require('node-cron');
const db = require('./database');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Run every day at 10 AM
cron.schedule('0 10 * * *', async () => {
  console.log('🔄 Running email automation...');
  await sendFollowUpEmails();
});

async function sendFollowUpEmails() {
  try {
    // Get leads that need follow-up
    const leads = await db.query(`
      SELECT l.*, c.name as company_name, c.email as company_email 
      FROM leads l
      JOIN companies c ON l.company_id = c.id
      WHERE l.status = 'new'
      AND l.created_at < NOW() - INTERVAL '3 days'
      AND l.follow_up_1_sent = false
    `);

    for (const lead of leads.rows) {
      await sendFirstFollowUp(lead);
    }

    // Second follow-up (7 days after, if no response)
    const secondFollowUp = await db.query(`
      SELECT l.*, c.name as company_name 
      FROM leads l
      JOIN companies c ON l.company_id = c.id
      WHERE l.status = 'new'
      AND l.created_at < NOW() - INTERVAL '7 days'
      AND l.follow_up_1_sent = true
      AND l.follow_up_2_sent = false
    `);

    for (const lead of secondFollowUp.rows) {
      await sendSecondFollowUp(lead);
    }

    // Final follow-up (14 days after)
    const finalFollowUp = await db.query(`
      SELECT l.*, c.name as company_name 
      FROM leads l
      JOIN companies c ON l.company_id = c.id
      WHERE l.status = 'new'
      AND l.created_at < NOW() - INTERVAL '14 days'
      AND l.follow_up_2_sent = true
      AND l.follow_up_3_sent = false
    `);

    for (const lead of finalFollowUp.rows) {
      await sendFinalFollowUp(lead);
    }

    console.log('✅ Email automation complete');
  } catch (error) {
    console.error('❌ Email automation error:', error);
  }
}

// First follow-up (Day 3)
async function sendFirstFollowUp(lead) {
  const msg = {
    to: lead.email,
    from: 'hello@renovationvision.io',
    subject: `Still interested in your ${lead.prompt.split(' ')[0]} renovation?`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">Hi ${lead.customer_name}! 👋</h2>
        
        <p>We noticed you created a visualization for your dream renovation a few days ago.</p>
        
        <p>Are you still planning to move forward with the project?</p>
        
        <div style="background: #f0f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Quick reminder of your reference code:</strong></p>
          <h2 style="color: #667eea; margin: 10px 0;">${lead.reference_code}</h2>
        </div>
        
        <p>If you'd like to discuss your project, simply reply to this email or give us a call!</p>
        
        <p><strong>Need to see your visualization again?</strong> <a href="${lead.generated_image}">Click here</a></p>
        
        <p style="margin-top: 40px;">Best regards,<br>${lead.company_name}</p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    await db.query('UPDATE leads SET follow_up_1_sent = true WHERE id = $1', [lead.id]);
    console.log(`✅ First follow-up sent to ${lead.email}`);
  } catch (error) {
    console.error('Email error:', error);
  }
}

// Second follow-up (Day 7)
async function sendSecondFollowUp(lead) {
  const msg = {
    to: lead.email,
    from: 'hello@renovationvision.io',
    subject: `Last chance - Your visualization is expiring soon`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">Your dream renovation awaits! 🏠</h2>
        
        <p>Hi ${lead.customer_name},</p>
        
        <p>Just checking in one more time about your renovation project.</p>
        
        <p><strong>We're here to help you turn your vision into reality.</strong></p>
        
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>⏰ Limited Time:</strong> Book a free consultation this week and get 10% off your quote preparation!</p>
        </div>
        
        <p>Your reference code: <strong>${lead.reference_code}</strong></p>
        
        <p><a href="tel:${lead.company_phone}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Call Us Now</a></p>
        
        <p style="color: #999; font-size: 14px; margin-top: 40px;">
          Not interested? <a href="#">Click here</a> and we won't bother you again.
        </p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    await db.query('UPDATE leads SET follow_up_2_sent = true WHERE id = $1', [lead.id]);
    console.log(`✅ Second follow-up sent to ${lead.email}`);
  } catch (error) {
    console.error('Email error:', error);
  }
}

// Final follow-up (Day 14)
async function sendFinalFollowUp(lead) {
  const msg = {
    to: lead.email,
    from: 'hello@renovationvision.io',
    subject: `We'll miss you - One final message`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${lead.customer_name},</h2>
        
        <p>This is our last email about your renovation project.</p>
        
        <p>We understand that timing isn't always right, and that's okay!</p>
        
        <p><strong>But just in case...</strong></p>
        
        <p>If you ever decide to move forward with your renovation, we'd love to help. Your visualization and reference code (${lead.reference_code}) will be saved for 6 months.</p>
        
        <p>Wishing you all the best! 🏠</p>
        
        <p style="margin-top: 40px;">Warm regards,<br>${lead.company_name}</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px;">
          You're receiving this because you used our renovation visualization tool. 
          <a href="#">Unsubscribe</a>
        </p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    await db.query('UPDATE leads SET follow_up_3_sent = true, status = $1 WHERE id = $2', ['closed', lead.id]);
    console.log(`✅ Final follow-up sent to ${lead.email}`);
  } catch (error) {
    console.error('Email error:', error);
  }
}

module.exports = { sendFollowUpEmails };