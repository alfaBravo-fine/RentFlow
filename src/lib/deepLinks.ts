/**
 * Section 11.13: Messengers Deep Links Engine
 * Generates and launches native/web messenger links
 */

export interface MessageTemplate {
  id: string;
  name: string;
  template: (data: {
    tenantName: string;
    propertyName: string;
    unitName: string;
    amountFormatted?: string;
    dueDate?: string;
    invoiceId?: string;
  }) => string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'rent_reminder',
    name: 'Rent Payment Reminder',
    template: ({ tenantName, unitName, amountFormatted, dueDate, invoiceId }) =>
      `Hello ${tenantName}, this is a friendly rent payment reminder for ${unitName} (Invoice #${invoiceId || 'Current'}). Outstanding amount: ${amountFormatted || 'due'} by ${dueDate || 'due date'}. Thank you!`,
  },
  {
    id: 'overdue_notice',
    name: 'Overdue Rent Notice',
    template: ({ tenantName, unitName, amountFormatted, dueDate }) =>
      `Dear ${tenantName}, your rent payment of ${amountFormatted || 'due amount'} for ${unitName} was due on ${dueDate || 'the due date'} and remains unpaid. Please arrange settlement today or contact management.`,
  },
  {
    id: 'payment_received',
    name: 'Payment Receipt Confirmation',
    template: ({ tenantName, unitName, amountFormatted, invoiceId }) =>
      `Hello ${tenantName}, we have received your payment of ${amountFormatted || 'the specified amount'} for ${unitName} (Ref #${invoiceId || 'Receipt'}). Thank you!`,
  },
  {
    id: 'maintenance_update',
    name: 'Maintenance Visit Notice',
    template: ({ tenantName, unitName }) =>
      `Hello ${tenantName}, an authorized maintenance contractor has been scheduled to inspect and service your unit (${unitName}). Please contact us if you need to reschedule.`,
  },
  {
    id: 'lease_renewal',
    name: 'Lease Renewal Discussion',
    template: ({ tenantName, unitName }) =>
      `Dear ${tenantName}, your lease agreement for ${unitName} is approaching its scheduled expiry date. Please let us know if you wish to renew your term.`,
  },
];

export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const clean = cleanPhoneNumber(phone);
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export function openWhatsAppMessage(phone: string, text: string) {
  const clean = cleanPhoneNumber(phone);
  const nativeUrl = `whatsapp://send?phone=${clean}&text=${encodeURIComponent(text)}`;
  const webUrl = `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;

  if (typeof window === 'undefined') return;

  const isOnline = navigator.onLine;
  if (!isOnline) {
    openExternalUrl(webUrl);
    return;
  }

  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = nativeUrl;
    document.body.appendChild(iframe);

    const timeout = setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      openExternalUrl(webUrl);
    }, 1000);

    const handleBlur = () => {
      clearTimeout(timeout);
      window.removeEventListener('blur', handleBlur);
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    };
    window.addEventListener('blur', handleBlur);
  } catch {
    openExternalUrl(webUrl);
  }
}

export function buildSmsLink(phone: string, text: string): string {
  const clean = cleanPhoneNumber(phone);
  return `sms:${clean}?body=${encodeURIComponent(text)}`;
}

export function buildEmailLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Opens an external URL or protocol handler cleanly inside iframes without popup-blocker errors.
 */
export function openExternalUrl(url: string) {
  if (!url || typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  if (!url.startsWith('mailto:') && !url.startsWith('tel:') && !url.startsWith('sms:')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Attempts to launch deep link or falls back to web URL
 */
export function openDeepLink(
  protocolUrl: string,
  webFallbackUrl: string,
  onCopiedFallback?: (link: string) => void
) {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline && onCopiedFallback) {
    onCopiedFallback(webFallbackUrl);
    return;
  }

  try {
    openExternalUrl(webFallbackUrl || protocolUrl);
  } catch {
    if (onCopiedFallback) {
      onCopiedFallback(webFallbackUrl);
    }
  }
}
