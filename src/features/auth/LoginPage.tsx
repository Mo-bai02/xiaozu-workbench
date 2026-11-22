import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Segmented, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { useGroupStore } from '@/store/group';

interface LoginValues {
  username: string;
  password: string;
  displayName?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const pending = useAuthStore((s) => s.pending);
  const error = useAuthStore((s) => s.error);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form] = Form.useForm<LoginValues>();

  const submit = async (values: LoginValues) => {
    try {
      if (mode === 'login') await login(values.username, values.password);
      else await register(values.username, values.password, values.displayName ?? values.username);

      await useGroupStore.getState().fetchGroups();
      const hasGroup = useGroupStore.getState().groups.length > 0;
      navigate(hasGroup ? '/overview' : '/groups', { replace: true });
    } catch {
      /* 错误信息已经存在 store 里，由 Alert 展示 */
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
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" block loading={pending} size="large">
            {mode === 'login' ? '登录' : '注册并进入'}
          </Button>
        </Form>

      </Card>
    </div>
  );
}
