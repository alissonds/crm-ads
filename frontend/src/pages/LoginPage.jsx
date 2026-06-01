import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@crm.local');
  const [password, setPassword] = useState('Admin@123');
  const [showPass, setShowPass] = useState(false);
  const { login, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciais inválidas');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-2xl">
            <TrendingUp size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">CRM ADS</h1>
          <p className="text-gray-400 mt-1">Google Ads & Meta Ads Intelligence</p>
        </div>

        {/* Form */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label text-gray-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input bg-white/10 border-white/20 text-white placeholder-gray-500 focus:ring-blue-500"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="label text-gray-300">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input bg-white/10 border-white/20 text-white placeholder-gray-500 pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-xs text-gray-500 text-center">
              Admin padrão: <span className="text-gray-300">admin@crm.local</span> / <span className="text-gray-300">Admin@123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
