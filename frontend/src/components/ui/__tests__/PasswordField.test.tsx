import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PasswordField from '../PasswordField';

describe('PasswordField', () => {
  beforeEach(() => {
    // Stub requestAnimationFrame and cancelAnimationFrame to run reliably
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(Date.now()), 0);
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders correctly with label and initial password type', () => {
    render(<PasswordField label="Password" />);
    const label = screen.getByText('Password');
    expect(label).toBeInTheDocument();

    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('password');
    // Verify CSS text-security fallback is active initially
    const inputStyle = input.style as CSSStyleDeclaration & { WebkitTextSecurity?: string };
    expect(inputStyle.WebkitTextSecurity).toBe('disc');
  });

  it('toggles password visibility when the toggle button is clicked', async () => {
    render(<PasswordField label="Password" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const button = screen.getByLabelText('Show password');

    // Click to show password
    fireEvent.click(button);

    await vi.waitFor(() => {
      const inputStyle = input.style as CSSStyleDeclaration & { WebkitTextSecurity?: string };
      expect(input.type).toBe('text');
      expect(inputStyle.WebkitTextSecurity).toBe('none');
    });

    // Click to hide password
    fireEvent.click(button);

    await vi.waitFor(() => {
      const inputStyle = input.style as CSSStyleDeclaration & { WebkitTextSecurity?: string };
      expect(input.type).toBe('password');
      expect(inputStyle.WebkitTextSecurity).toBe('disc');
    });
  });

  it('does not trigger blur or focus logic if input is not focused when toggled (Focus Gating)', async () => {
    render(<PasswordField label="Password" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const button = screen.getByLabelText('Show password');

    const blurSpy = vi.spyOn(input, 'blur');
    const focusSpy = vi.spyOn(input, 'focus');

    // Toggle visibility without focusing first
    fireEvent.click(button);

    await vi.waitFor(() => {
      expect(input.type).toBe('text');
    });

    expect(blurSpy).not.toHaveBeenCalled();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('triggers blur/focus logic to resolve WebKit bug if input is focused when toggled', async () => {
    render(<PasswordField label="Password" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const button = screen.getByLabelText('Show password');

    // Rendered input should start as type="password", toggle to type="text"
    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(input.type).toBe('text');
    });

    // Focus input
    input.focus();
    expect(document.activeElement).toBe(input);

    const blurSpy = vi.spyOn(input, 'blur');
    const focusSpy = vi.spyOn(input, 'focus');

    // Toggle back to password (which triggers the WebKit masking workaround)
    // Mock activeElement to simulate focus preservation (e.g. from e.preventDefault() on mousedown/touchstart)
    const activeElementSpy = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(input);

    fireEvent.click(button);

    await vi.waitFor(() => {
      expect(input.type).toBe('password');
      expect(blurSpy).toHaveBeenCalledTimes(1);
      expect(focusSpy).toHaveBeenCalledTimes(1);
    });

    activeElementSpy.mockRestore();
  });

  it('cancels pending animation frames on rapid multiple clicks', async () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');

    render(<PasswordField label="Password" />);
    const button = screen.getByLabelText('Show password');

    // Click twice rapidly
    fireEvent.click(button);
    fireEvent.click(button);

    expect(cancelSpy).toHaveBeenCalled();
  });
});
