import { createClient } from '@/lib/supabase-browser'

export async function isUsernameTaken(username: string): Promise<boolean> {
  const supabase = createClient()
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', username)
  return !!(count && count > 0)
}
