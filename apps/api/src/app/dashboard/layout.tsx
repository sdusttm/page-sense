import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { logout } from '../login/actions'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans flex">
            {/* Sidebar Navigation */}
            <aside className="w-64 border-r border-neutral-800 bg-neutral-950 hidden md:flex flex-col">
                <div className="p-6 border-b border-neutral-800">
                    <h2 className="text-xl font-bold tracking-tight text-white">Page Sense</h2>
                    <p className="text-xs text-neutral-500 font-mono mt-1 mt-2 tracking-widest uppercase">Admin API</p>
                </div>

                <nav className="p-4 space-y-1 flex-1">
                    <a href="/dashboard/api-keys" className="block px-3 py-2 rounded-md bg-neutral-900 text-white text-sm font-medium border border-neutral-800">
                        API Keys
                    </a>
                    {/* Future links */}
                    <a href="#" className="block px-3 py-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900 text-sm font-medium transition-colors cursor-not-allowed">
                        Usage Logs
                    </a>
                    <a href="#" className="block px-3 py-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900 text-sm font-medium transition-colors cursor-not-allowed">
                        Billing
                    </a>
                </nav>

                <div className="p-4 border-t border-neutral-800">
                    <div className="text-xs text-neutral-500 mb-2 truncate px-2">{user.email}</div>
                    <form action={logout}>
                        <button className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer">
                            Sign Out
                        </button>
                    </form>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 bg-[#0a0a0a] overflow-y-auto">
                {children}
            </main>
        </div>
    )
}
