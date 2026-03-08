import { createClient } from '@/utils/supabase/server'
import { generateNewKey, revokeKey } from './actions'

export default async function ApiKeysPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return null // Middleware handles redirect
    }

    // Fetch keys for this user
    const { data: keys } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">API Keys</h1>
                    <p className="text-neutral-400 mt-1 text-sm">Manage API keys to authenticate your library requests.</p>
                </div>
                <form action={generateNewKey}>
                    <button className="bg-white text-black hover:bg-neutral-200 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm cursor-pointer">
                        + Generate New Key
                    </button>
                </form>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl">
                {(!keys || keys.length === 0) ? (
                    <div className="p-12 text-center text-neutral-500">
                        <p>No API keys found.</p>
                        <p className="text-sm mt-2">Generate your first key to get started.</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-neutral-950/50 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th scope="col" className="px-6 py-4">Name</th>
                                <th scope="col" className="px-6 py-4">Key</th>
                                <th scope="col" className="px-6 py-4">Created</th>
                                <th scope="col" className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/50">
                            {keys.map((key) => (
                                <tr key={key.id} className="hover:bg-neutral-800/30 transition-colors">
                                    <td className="px-6 py-4 text-neutral-300 font-medium">
                                        {key.name || 'API Key'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <code className="bg-neutral-950 text-emerald-400 px-2 py-1 rounded font-mono text-xs border border-neutral-800">
                                            {key.key}
                                        </code>
                                    </td>
                                    <td className="px-6 py-4 text-neutral-500 text-xs">
                                        {new Date(key.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <form action={revokeKey.bind(null, key.id)}>
                                            <button className="text-red-400 hover:text-red-300 text-xs font-medium cursor-pointer transition-colors">
                                                Revoke
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="mt-8 text-xs text-neutral-500 bg-neutral-900/50 border border-neutral-800/50 rounded-lg p-4">
                <p className="font-semibold text-neutral-300 mb-2">Usage Example</p>
                <p>Pass your generated key to the Page Sense Library React Provider to start tracking interactions.</p>
                <pre className="mt-3 block bg-[#0a0a0a] p-3 rounded-md border border-neutral-800 font-mono text-emerald-400/80 overflow-x-auto">
                    {'<TrackerProvider \n  apiUrl="https://your-api.com/api" \n  apiKey="sk-ps-..."\n>\n  {children}\n</TrackerProvider>'}
                </pre>
            </div>
        </div>
    )
}
