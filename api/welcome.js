const nodemailer = require('nodemailer');

function buildCaption(payload) {
    const type = payload.type === 'organizer' ? 'Organizer' : 'Venue';
    const portalUrl = payload.portalUrl || '';
    const slug = payload.slug || '';
    const venuePath = portalUrl || ('https://www.courtqpro.online/portal.html?venue=' + slug);
    return [
        'NEW ' + type.toUpperCase() + ' REGISTERED ON COURTQ PRO',
        '',
        'Name: ' + payload.displayName,
        (payload.logoUrl ? 'Logo: ' + payload.logoUrl : ''),
        '',
        'Caption for Facebook:',
        '----------------------------------------------',
        '🎉 Welcome to CourtQ Pro, ' + payload.displayName + '! 🏓',
        '',
        'We are excited to have ' + (type === 'Organizer' ? 'you organizing pickleball games' : 'your venue on our platform') + ' with us!',
        'Book your next game now with ' + payload.displayName + ':',
        venuePath,
        '#CourtQPro #Pickleball #Philippines',
        '----------------------------------------------',
        '',
        'Banner image: ' + payload.bannerUrl
    ].filter(Boolean).join('\n');
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const to = process.env.WELCOME_TO_EMAIL;
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!to || !gmailUser || !gmailPass) {
        return res.status(500).json({ ok: false, error: 'Missing Gmail env vars' });
    }

    try {
        let payload = req.body || {};
        const caption = buildCaption(payload);

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: gmailUser, pass: gmailPass }
        });

        const mail = {
            from: 'CourtQ Pro <' + gmailUser + '>',
            to: to,
            subject: (payload.type === 'organizer' ? 'New Organizer' : 'New Venue') + ': ' + payload.displayName + ' — CourtQ Pro',
            text: caption,
            html: '<pre style="font-family:inherit;white-space:pre-wrap">' + caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>'
        };

        if (payload.bannerUrl) {
            const img = await fetch(payload.bannerUrl);
            if (img.ok) {
                const buf = Buffer.from(await img.arrayBuffer());
                mail.attachments = [{
                    filename: 'welcome_banner.png',
                    content: buf,
                    cid: 'welcomeBanner'
                }];
            }
        }

        const info = await transporter.sendMail(mail);
        return res.status(200).json({ ok: true, messageId: info.messageId });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
};
