export function hasRequiredDisclaimer(response: string, disclaimerText: string): boolean {
  if (response.includes(disclaimerText)) return true;
  return /\*?Disclaimer[:;]?\s*Educational only\.?\s*Not medical advice\.?\*?/i.test(response);
}

export function appendDisclaimer(response: string, disclaimerText: string): string {
  if (hasRequiredDisclaimer(response, disclaimerText)) return response;
  return `${response.trim()}\n\n${disclaimerText}`;
}
