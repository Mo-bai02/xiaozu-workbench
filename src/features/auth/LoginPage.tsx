import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Segmented, Typography } from 'antd';
import { LockOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { passwordStrength } from '@/lib/password';
import { useAuthStore } from '@/store/auth';
import { useGroupStore } from '@/store/group';

interface LoginValues {
  username: string;
  password: string;
  confirm?: string;
  displayName?: string;
  captcha?: string;
}

interface Captcha {
  id: string;
  image: string;
}

function StrengthMeter({ value }: { value: string }) {
  const strength = passwordStrength(value);
  if (!value) return null;

  return (
    <div className="pw-meter">
      <div className="pw-bars">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="pw-bar"
            style={{ background: level <= strength.score ? strength.color : 'var(--border)' }}
          />
        ))}
        <span className="pw-label" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>
      {strength.tips.length > 0 && (
        <div className="pw-tips">还可以：{strength.tips.join('、')}</div>
      )}
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const pending = useAuthStore((s) => s.pending);
  const error = useAuthStore((s) => s.error);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [form] = Form.useForm<LoginValues>();

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const data = await api<Captcha>('/auth/captcha', { anonymous: true });
      setCaptcha(data);
      form.setFieldValue('captcha', '');
    } catch {
      setCaptcha(null);
    } finally {
      setCaptchaLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (mode === 'register' && !captcha) void loadCaptcha();
  }, [mode, captcha, loadCaptcha]);

  const submit = async (values: LoginValues) => {
    try {
      if (mode === 'login') {
        await login(values.username, values.password);
      } else {
        await register(values.username, values.password, values.displayName ?? values.username, {
          id: captcha?.id ?? '',
          text: values.captcha ?? '',
        });
      }

      await useGroupStore.getState().fetchGroups();
      const hasGroup = useGroupStore.getState().groups.length > 0;
      navigate(hasGroup ? '/overview' : '/groups', { replace: true });
    } catch {
      // 验证码一次性，失败后换一张，避免用户对着同一个死码反复输
      if (mode === 'register') void loadCaptcha();
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <span className="auth-logo">AI</span>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            AI Console
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            小组工作台
          </Typography.Text>
        </div>
      </div>

      <Card className="auth-card">
        <Segmented
          block
          value={mode}
          onChange={(value) => {
            setMode(value as 'login' | 'register');
            useAuthStore.getState().clearError();
            form.resetFields();
            setPassword('');
          }}
          options={[
            { label: '登录', value: 'login' },
            { label: '注册', value: 'register' },
          ]}
          style={{ marginBottom: 18 }}
        />

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '3-20 位字母、数字或下划线' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="3-20 位字母、数字或下划线" autoComplete="username" />
          </Form.Item>

          {mode === 'register' && (
            <Form.Item name="displayName" label="昵称">
              <Input placeholder="不填就用用户名" maxLength={12} />
            </Form.Item>
          )}

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '至少 6 位' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={mode === 'register' ? '至少 6 位' : ''}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Form.Item>

          {mode === 'register' && (
            <>
              <StrengthMeter value={password} />

              <Form.Item
                name="confirm"
                label="确认密码"
                dependencies={['password']}
                hasFeedback
                rules={[
                  { required: true, message: '再输入一次密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve();
                      return Promise.reject(new Error('两次输入不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="再输入一次"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Form.Item
                name="captcha"
                label="验证码"
                rules={[
                  { required: true, message: '请输入验证码' },
                  { len: 4, message: '验证码是 4 位' },
                ]}
              >
                <div className="captcha-row">
                  <Input
                    prefix={<SafetyOutlined />}
                    placeholder="看图输入"
                    maxLength={4}
                    autoComplete="off"
                    style={{ flex: 1, textTransform: 'uppercase' }}
                  />
                  <button
                    type="button"
                    className="captcha-img"
                    onClick={() => void loadCaptcha()}
                    title="看不清？换一张"
                  >
                    {captcha ? (
                      <img src={captcha.image} alt="验证码" width={120} height={40} />
                    ) : (
                      <span className="captcha-placeholder">
                        {captchaLoading ? '加载中…' : '点击获取'}
                      </span>
                    )}
                  </button>
                </div>
              </Form.Item>
            </>
          )}

          <Button type="primary" htmlType="submit" block loading={pending} size="large">
            {mode === 'login' ? '登录' : '注册并进入'}
          </Button>

          {mode === 'register' && (
            <Typography.Text
              type="secondary"
              style={{ fontSize: 11.5, display: 'block', marginTop: 10 }}
            >
              点图片换一张
            </Typography.Text>
          )}
        </Form>
      </Card>
    </div>
  );
}
