"use client";

import { useState } from 'react';
import { toast } from 'sonner';

export function Cart() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
            >
                <span>🛒</span>
                <span className="font-semibold">Cart (0)</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-xl border border-gray-200 z-50 p-4">
                    <h3 className="text-lg font-bold mb-4 text-black">Your Cart</h3>
                    <p className="text-gray-500 text-sm mb-4">Your cart is empty.</p>
                    <button
                        onClick={() => toast.info('Proceeding to secure checkout...')}
                        className="w-full bg-black text-white py-2 rounded-md hover:bg-gray-800"
                    >
                        Checkout
                    </button>
                </div>
            )}
        </div>
    );
}
