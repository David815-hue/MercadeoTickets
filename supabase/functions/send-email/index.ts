import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Manejo de peticiones preflight (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { ticket_id, type, message_text, new_status } = await req.json();

    if (!ticket_id) {
      return new Response(JSON.stringify({ error: 'Falta ticket_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Obtener los detalles del ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticket_id)
      .single();

    if (ticketErr || !ticket) {
      throw new Error(`No se pudo obtener el ticket: ${ticketErr?.message}`);
    }

    // 2. Obtener los contactos de la farmacia
    const { data: contacts, error: contactsErr } = await supabase
      .from('pharmacy_contacts')
      .select('*')
      .eq('profile_id', ticket.user_id)
      .single();

    if (contactsErr) {
      console.warn(`No se encontraron contactos para la farmacia (user_id: ${ticket.user_id}):`, contactsErr.message);
    }

    // 3. Determinar destinatario
    let recipientEmail = '';
    let recipientName = '';
    const role = ticket.requester_role || 'Jefe de Tienda';

    if (contacts) {
      if (role === 'Supervisor' || role === 'Regente') {
        recipientEmail = contacts.regente_email || '';
        recipientName = contacts.regente_name || '';
      } else {
        // Jefe de Tienda / Jefe de Farmacia
        recipientEmail = contacts.jefe_email || '';
        recipientName = contacts.jefe_name || '';
      }

      // Fallback si el preferido está vacío
      if (!recipientEmail) {
        recipientEmail = contacts.jefe_email || contacts.regente_email || '';
        recipientName = contacts.jefe_name || contacts.regente_name || '';
      }
    }

    if (!recipientEmail) {
      console.log(`No hay correo configurado para enviar notificaciones del ticket ${ticket_id}.`);
      return new Response(JSON.stringify({ success: true, message: 'No email sent (recipient not configured)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Configurar el transporte SMTP de Brevo
    const smtpUser = Deno.env.get('SMTP_USER') || '';
    const smtpPass = Deno.env.get('SMTP_PASS') || '';
    const smtpFrom = Deno.env.get('SMTP_FROM') || '';

    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // 5. Preparar el contenido del correo
    const ticketNo = ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}`;
    
    let subject = '';
    let bodyHtml = '';

    if (type === 'message') {
      subject = `Nuevo mensaje en tu solicitud de mercadeo ${ticketNo}`;
      bodyHtml = `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; padding: 30px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <!-- HEADER -->
                <tr>
                  <td align="center" bgcolor="#4f46e5" style="padding: 28px 24px;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #ffffff; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; letter-spacing: 0.5px;">Mercadeo te envió un mensaje</h2>
                  </td>
                </tr>
                <!-- BODY -->
                <tr>
                  <td style="padding: 36px 32px; color: #374151; font-size: 15px; line-height: 1.6;">
                    <p style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #111827; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">Hola <strong>${recipientName || 'colaborador'}</strong>,</p>
                    <p style="margin-top: 0; margin-bottom: 24px; color: #4b5563; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">El departamento de Mercadeo ha enviado un nuevo mensaje respecto a tu solicitud de mercadeo <strong>${ticketNo}</strong>:</p>
                    
                    <!-- Message block -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
                      <tr>
                        <td style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 18px; border-radius: 0 8px 8px 0; font-style: italic; color: #1f2937; font-size: 15px; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                          "${message_text}"
                        </td>
                      </tr>
                    </table>
                    
                    <!-- BUTTON -->
                    <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" bgcolor="#4f46e5" style="border-radius: 8px; padding: 12px 30px;">
                          <a href="https://ticket-system.vercel.app/" target="_blank" style="font-size: 15px; font-weight: bold; color: #ffffff; text-decoration: none; display: block; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">Ver Ticket y Responder</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- FOOTER -->
                <tr>
                  <td align="center" style="padding: 20px 32px; border-top: 1px solid #f3f4f6; background-color: #fafafa;">
                    <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">Este es un correo automático. Por favor, no respondas directamente a este mensaje.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    } else if (type === 'status') {
      subject = `Actualización de estado en tu solicitud de mercadeo ${ticketNo}`;
      
      let statusColor = '#2563eb'; // azul oscuro
      let statusBg = '#eff6ff'; // azul claro
      let statusBorder = '#bfdbfe'; // azul medio
      
      if (new_status === 'Aprobado' || new_status === 'Finalizado') {
        statusColor = '#16a34a'; // verde oscuro
        statusBg = '#f0fdf4'; // verde claro
        statusBorder = '#bbf7d0'; // verde medio
      } else if (new_status === 'Rechazado') {
        statusColor = '#dc2626'; // rojo oscuro
        statusBg = '#fef2f2'; // rojo claro
        statusBorder = '#fecaca'; // rojo medio
      }
 
      bodyHtml = `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; padding: 30px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <!-- HEADER -->
                <tr>
                  <td align="center" bgcolor="#4f46e5" style="padding: 28px 24px;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #ffffff; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; letter-spacing: 0.5px;">Estado de solicitud actualizado</h2>
                  </td>
                </tr>
                <!-- BODY -->
                <tr>
                  <td style="padding: 36px 32px; color: #374151; font-size: 15px; line-height: 1.6;">
                    <p style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #111827; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">Hola <strong>${recipientName || 'colaborador'}</strong>,</p>
                    <p style="margin-top: 0; margin-bottom: 24px; color: #4b5563; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">Te informamos que el estado de tu solicitud de mercadeo <strong>${ticketNo}</strong> ha sido actualizado a:</p>
                    
                    <!-- STATUS BADGE -->
                    <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" bgcolor="${statusBg}" style="border: 1px solid ${statusBorder}; border-radius: 30px; padding: 8px 24px;">
                          <span style="font-size: 16px; font-weight: bold; color: ${statusColor}; text-transform: uppercase; letter-spacing: 0.5px; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                            ${new_status}
                          </span>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Spacing -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td height="24" style="font-size: 1px; line-height: 1px;">&nbsp;</td>
                      </tr>
                    </table>
                    
                    <!-- BUTTON -->
                    <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" bgcolor="#4f46e5" style="border-radius: 8px; padding: 12px 30px;">
                          <a href="https://ticket-system.vercel.app/" target="_blank" style="font-size: 15px; font-weight: bold; color: #ffffff; text-decoration: none; display: block; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">Revisar en el Sistema</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- FOOTER -->
                <tr>
                  <td align="center" style="padding: 20px 32px; border-top: 1px solid #f3f4f6; background-color: #fafafa;">
                    <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">Este es un correo automático. Por favor, no respondas directamente a este mensaje.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    }

    // 6. Enviar correo
    const mailOptions = {
      from: `"Soporte Mercadeo" <${smtpFrom}>`,
      to: recipientEmail,
      subject: subject,
      html: bodyHtml,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email enviado con éxito a ${recipientEmail}:`, info.messageId);

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error en send-email function:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
