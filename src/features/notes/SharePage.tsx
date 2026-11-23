import { useEffect, useState } from 'react';
import { Button, Card, Result, Skeleton, Tag, Typography } from 'antd';
import { LinkOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { Markdown } from '@/components/Markdown';
import { getShare, type SharedNote } from '@/lib/api';

export function SharePage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<SharedNote | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getShare(id)
      .then((note) => {
        if (alive) setData(note);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="share-page">
        <Result
          status="404"
          title="分享不存在"
          subTitle={error}
          extra={
            <Link to="/overview">
              <Button type="primary">回到工作台</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="share-page">
      <div className="share-head">
        <Typography.Text type="secondary">
          <LinkOutlined /> 来自 AI Console 的分享笔记
        </Typography.Text>
        <Link to="/overview">
          <Button size="small" type="text">
            打开工作台
          </Button>
        </Link>
      </div>

      <Card className="share-card">
        {!data ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <>
            <Typography.Title level={2} style={{ marginTop: 0 }}>
              {data.title}
            </Typography.Title>
            <div className="share-meta">
              <Tag>{new Date(data.createdAt).toLocaleDateString('zh-CN')}</Tag>
              <span>{data.views} 次浏览</span>
              <span>
                <LockOutlined /> 只读
              </span>
            </div>
            <div className="share-body">
              <Markdown source={data.content} />
            </div>
          </>
        )}
      </Card>

      <div className="share-foot">
        分享链接在服务重启后失效。
      </div>
    </div>
  );
}
