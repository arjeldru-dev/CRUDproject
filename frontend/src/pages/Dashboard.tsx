import React from 'react';
import { useAuthStore } from '../store/authStore';
import { Wallet, Users, TrendingUp } from 'lucide-react';

/**
 * Dashboard placeholder page — will be fully built in Phase 8.
 * Shows a welcome message and feature cards.
 */
const Dashboard: React.FC = () => {
  const { user } = useAuthStore();

  const featureCards = [
    {
      icon: Wallet,
      title: 'Budget Tracker',
      description: 'Monitor your spending categories and limits in real-time.',
      color: 'from-indigo-500 to-blue-500',
    },
    {
      icon: Users,
      title: 'Split Expenses',
      description: 'Track shared costs and settle debts with friends.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: TrendingUp,
      title: 'Balance Overview',
      description: 'See who owes you and what you owe at a glance.',
      color: 'from-emerald-500 to-teal-500',
    },
  ];

  return (
    <div>
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="text-zinc-400 mt-1">
          Here's an overview of your financial activity.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {featureCards.map((card) => (
          <div
            key={card.title}
            className="group bg-white/[0.03] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300"
          >
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}
            >
              <card.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              {card.title}
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {card.description}
            </p>
          </div>
        ))}
      </div>

      {/* Placeholder Notice */}
      <div className="mt-10 text-center py-12 border border-dashed border-white/10 rounded-2xl">
        <p className="text-zinc-500 text-sm">
          Full dashboard with budget charts and balance summaries coming in Phase 8.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
