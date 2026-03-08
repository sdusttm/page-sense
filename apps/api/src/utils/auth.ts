import { createClient } from '@supabase/supabase-js';

// Requires a Service Role key because we need to query the api_keys table 
// without an active authenticated user session (the API consumers are machines/libraries)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function validateApiKey(request: Request): Promise<{ error?: string, status?: number }> {
    const authHeader = request.headers.get('authorization');
    const xApiKeyHeader = request.headers.get('x-api-key');

    let token = xApiKeyHeader;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }

    if (!token) {
        return { error: 'Unauthorized. API Key is missing.', status: 401 };
    }

    try {
        // Query the Supabase database for the key using the Service Role
        const { data: apiKeyData, error } = await supabase
            .from('api_keys')
            .select('id')
            .eq('key', token)
            .single();

        if (error || !apiKeyData) {
            return { error: 'Forbidden. Invalid API Key provided.', status: 403 };
        }

    } catch (error) {
        console.error('Error validating API key against database:', error);
        return { error: 'Internal Server Error while validating API key.', status: 500 };
    }

    return {}; // Success, no error
}
