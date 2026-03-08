'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function generateNewKey() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Not authenticated')
    }

    const newKey = 'sk-ps-' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

    const { error } = await supabase
        .from('api_keys')
        .insert({
            user_id: user.id,
            key: newKey,
            name: `Key created on ${new Date().toLocaleDateString()}`
        })

    if (error) {
        console.error("Error generating key:", error)
        throw new Error('Failed to generate API Key')
    }

    revalidatePath('/dashboard/api-keys')
}

export async function revokeKey(keyId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Not authenticated')
    }

    const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)
    // RLS will also ensure that they only delete their own keys

    if (error) {
        console.error("Error revoking key:", error)
        throw new Error('Failed to revoke API Key')
    }

    revalidatePath('/dashboard/api-keys')
}
