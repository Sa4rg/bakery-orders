import { z } from 'zod'

/**
 * Client-side validation is UX only. Supabase Auth remains the authority on
 * credentials. The password is intentionally neither trimmed nor length-checked
 * so existing accounts are never blocked by a client rule.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
})

export type LoginCredentials = z.infer<typeof loginSchema>
