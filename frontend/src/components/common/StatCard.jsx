import clsx from 'clsx';

export default function StatCard({ title, value, sub, icon: Icon, color = 'blue', trend, loading }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-20" />
      </div>
    );
  }

  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
          {trend != null && (
            <p className={clsx('text-xs font-medium mt-1', trend >= 0 ? 'text-green-600' : 'text-red-600')}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% vs período anterior
            </p>
          )}
        </div>
        {Icon && (
          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', colors[color])}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}
