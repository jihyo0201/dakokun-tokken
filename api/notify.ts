import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, message, emailTo, resendApiKey, emailFrom } = req.body;

  if (!emailTo || !resendApiKey) {
    return res.status(400).json({ error: 'emailTo and resendApiKey are required' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom || 'だこくん <onboarding@resend.dev>',
        to: emailTo,
        subject: `【だこくん】${title}`,
        text: message,
      }),
    });

    const data = await response.json();
    return res.status(200).json({ success: response.ok, data });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
}
