import { login, signup } from './actions'

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>
}) {
    const error = (await searchParams).error

    return (
        <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight">Page Sense Gateway</h1>
                    <p className="text-neutral-400 mt-2 text-sm">Sign in to manage your API Keys.</p>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                    <form className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-300" htmlFor="email">Email</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-300" htmlFor="password">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600"
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg">
                                {decodeURIComponent(error)}
                            </div>
                        )}

                        <div className="pt-2 flex flex-col gap-3">
                            <button
                                formAction={login}
                                className="w-full bg-white text-black hover:bg-neutral-200 px-4 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                            >
                                Sign In
                            </button>
                            <button
                                formAction={signup}
                                className="w-full bg-transparent text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                            >
                                Create Account
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    )
}
