export default function Dashboard() {
    return (
        <div className="min-h-screen flex bg-gray-50 font-sans text-gray-900">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col">
                <div className="h-16 flex items-center px-6 font-bold text-white text-lg tracking-wide border-b border-slate-800">
                    PulseAnalytics
                </div>
                <nav className="flex-1 px-4 py-6 space-y-2">
                    <a href="#" className="flex items-center gap-3 px-3 py-2 bg-blue-600 text-white rounded-lg font-medium">
                        <span>📊</span> Overview
                    </a>
                    <a href="#" className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
                        <span>👥</span> Audience
                    </a>
                    <a href="#" className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
                        <span>💰</span> Revenue
                    </a>
                    <a href="#" className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
                        <span>⚙️</span> Settings
                    </a>
                </nav>
                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-white">
                            JS
                        </div>
                        <div className="text-sm">
                            <p className="text-white font-medium">John Smith</p>
                            <p className="text-xs text-slate-500">Pro Plan</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Top Header */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
                    <h1 className="text-xl font-semibold">Dashboard Overview</h1>
                    <div className="flex items-center gap-4">
                        <button className="text-gray-500 hover:text-gray-900">🔔 Notifications</button>
                        <button className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition">
                            Export Report
                        </button>
                    </div>
                </header>

                {/* Dashboard Area */}
                <div className="flex-1 p-8 overflow-y-auto">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-medium text-gray-500 mb-1">Total Users</h3>
                            <p className="text-3xl font-bold text-gray-900">124,592</p>
                            <p className="text-sm text-green-600 mt-2 font-medium">↑ 12% from last month</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-medium text-gray-500 mb-1">Active Sessions</h3>
                            <p className="text-3xl font-bold text-gray-900">8,234</p>
                            <p className="text-sm text-green-600 mt-2 font-medium">↑ 5.2% from last month</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-medium text-gray-500 mb-1">MRR</h3>
                            <p className="text-3xl font-bold text-gray-900">$45,290</p>
                            <p className="text-sm text-red-500 mt-2 font-medium">↓ 1.4% from last month</p>
                        </div>
                    </div>

                    {/* Charts/Tables Area */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-32">
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-lg">Revenue Trend</h3>
                                <select className="text-sm border-gray-300 rounded-md">
                                    <option>Last 30 Days</option>
                                    <option>This Year</option>
                                </select>
                            </div>
                            <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 border border-dashed border-gray-200">
                                [ Line Chart Placeholder ]
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <h3 className="font-bold text-lg mb-4">Top Pages</h3>
                            <ul className="space-y-4">
                                <li className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 truncate">/home</span>
                                    <span className="text-sm font-bold">45,200</span>
                                </li>
                                <li className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 truncate">/pricing</span>
                                    <span className="text-sm font-bold">12,150</span>
                                </li>
                                <li className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 truncate">/features</span>
                                    <span className="text-sm font-bold">9,420</span>
                                </li>
                                <li className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 truncate">/blog/ai-future</span>
                                    <span className="text-sm font-bold">7,800</span>
                                </li>
                                <li className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 truncate">/contact</span>
                                    <span className="text-sm font-bold">3,120</span>
                                </li>
                            </ul>
                            <button className="w-full mt-6 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-lg transition">
                                View full report
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
