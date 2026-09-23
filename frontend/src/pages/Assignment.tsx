import { Card, Typography, Form, Input, Button, Space, Descriptions, Tag, Radio, message, List, Avatar, Modal, Row, Col, Alert } from 'antd';
import { ArrowLeftOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { assignmentApi } from '@/api/assignment';
import type { AssignmentSubmitPayload } from '@/api/assignment';
import { Assignment, AssignmentType, SubmissionStatus, AssignmentSubmission, ChoiceAnswerItem } from '@/types/assignment';
import { useAuthStore } from '@/store/auth';
import { UserRole } from '@/types/user';

const { Title, Paragraph, Text } = Typography;

export default function AssignmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [choiceSelection, setChoiceSelection] = useState<number[]>([]);
  const [form] = Form.useForm();
  const { user } = useAuthStore();

  const isTeacher = user?.role === UserRole.TEACHER;

  useEffect(() => {
    if (id) {
      loadAssignment();
    }
  }, [id]);

  const loadAssignment = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await assignmentApi.get(id);
      setAssignment(data);

      if (isTeacher) {
        const subs = await assignmentApi.getSubmissions(id);
        setSubmissions(subs);
      } else {
        const mySub = await assignmentApi.getMySubmission(id);
        setSubmission(mySub);
        if (mySub) {
          if (data.type === AssignmentType.CHOICE && Array.isArray(mySub.choiceAnswers)) {
            setChoiceSelection(mySub.choiceAnswers.map(a => a.selected));
          } else {
            form.setFieldsValue({
              textAnswer: mySub.textAnswer,
            });
          }
        } else {
          form.resetFields();
          setChoiceSelection([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const isClosed = () => {
    return !!assignment?.deadline && new Date(assignment.deadline).getTime() < Date.now();
  };

  const doSubmit = async (payload: AssignmentSubmitPayload) => {
    if (!id) return;
    setSubmitting(true);
    try {
      const result = await assignmentApi.submit(id, payload);
      setSubmission(result);
      message.success('提交成功');
      await loadAssignment();
    } catch (error: any) {
      message.error(error.response?.data?.message || '提交失败，原提交已保留');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChoiceSubmit = () => {
    if (!assignment) return;
    const questions = assignment.questions || [];
    // 前端先做一次完整性校验，后端会再次整份校验
    if (choiceSelection.length !== questions.length || choiceSelection.some(v => v === undefined || v === null)) {
      message.error('请完成全部题目后再提交');
      return;
    }
    doSubmit({ choiceAnswers: choiceSelection });
  };

  const handleTextSubmit = (values: any) => {
    doSubmit({ textAnswer: values.textAnswer });
  };

  const handleGrade = (submission: AssignmentSubmission) => {
    Modal.confirm({
      title: '批改作业',
      content: (
        <div style={{ marginTop: 16 }}>
          <Paragraph strong>学生答案：</Paragraph>
          <Paragraph>{submission.textAnswer || '无文本答案'}</Paragraph>
        </div>
      ),
      okText: '批改',
      onOk: async () => {
        const score = 85;
        const feedback = '做得很好！';
        try {
          await assignmentApi.grade(submission.id, score, feedback);
          message.success('批改完成');
          loadAssignment();
        } catch (error: any) {
          message.error(error.response?.data?.message || '批改失败');
        }
      },
    });
  };

  const getTypeText = (type: AssignmentType) => {
    switch (type) {
      case AssignmentType.TEXT:
        return '文本题';
      case AssignmentType.CHOICE:
        return '选择题';
      case AssignmentType.ATTACHMENT:
        return '附件提交';
    }
  };

  const getStatusTag = (status: SubmissionStatus) => {
    switch (status) {
      case SubmissionStatus.SUBMITTED:
        return <Tag color="blue">待批改</Tag>;
      case SubmissionStatus.GRADED:
        return <Tag color="green">已批改</Tag>;
    }
  };

  const renderChoiceResult = (questionIndex: number, answer: ChoiceAnswerItem) => {
    const question = assignment?.questions?.[questionIndex];
    if (!question || !submission || submission.status !== SubmissionStatus.GRADED) return null;
    return (
      <Space size="small" style={{ marginTop: 4 }}>
        {answer.correct ? (
          <Tag icon={<CheckCircleOutlined />} color="success">回答正确</Tag>
        ) : (
          <>
            <Tag icon={<CloseCircleOutlined />} color="error">回答错误</Tag>
            <Text type="secondary">
              你的选择：{String.fromCharCode(65 + answer.selected)}；
              正确答案：{String.fromCharCode(65 + question.answer)}
            </Text>
          </>
        )}
      </Space>
    );
  };

  if (loading) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>加载中...</div></Card>;
  }

  if (!assignment) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>作业不存在</div></Card>;
  }

  const closed = isClosed();
  const choiceGraded = assignment.type === AssignmentType.CHOICE
    && submission?.status === SubmissionStatus.GRADED;

  return (
    <div>
      <Space style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          {assignment.title}
        </Title>
        <Tag>{getTypeText(assignment.type)}</Tag>
      </Space>

      <Row gutter={24}>
        <Col span={16}>
          <Card title="作业详情">
            <Descriptions column={1}>
              <Descriptions.Item label="作业说明">
                <Paragraph>{assignment.description}</Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="满分">
                {assignment.maxScore} 分
              </Descriptions.Item>
              {assignment.deadline && (
                <Descriptions.Item label="截止时间">
                  <Space>
                    <ClockCircleOutlined />
                    {new Date(assignment.deadline).toLocaleString()}
                    {closed && <Tag color="red">已截止</Tag>}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {!isTeacher && assignment.type === AssignmentType.CHOICE && (
            <Card title="选择题作答" style={{ marginTop: 24 }}>
              {choiceGraded && (
                <Alert
                  style={{ marginBottom: 16 }}
                  type="success"
                  message={
                    <Space direction="vertical" size={0}>
                      <Text strong>
                        得分：{submission.score} / {assignment.maxScore} 分
                        （答对 {submission.correctCount} / {assignment.questions?.length || 0} 题）
                      </Text>
                      <Text type="secondary">
                        批改时间：{submission.gradedAt ? new Date(submission.gradedAt).toLocaleString() : '-'}
                      </Text>
                    </Space>
                  }
                />
              )}
              {closed && !submission && (
                <Alert style={{ marginBottom: 16 }} type="warning" message="作业已截止，无法提交" />
              )}
              <Space direction="vertical" size={24} style={{ width: '100%', marginTop: 16 }}>
                {(assignment.questions || []).map((q, qIndex) => {
                  const answerItem: ChoiceAnswerItem | undefined =
                    Array.isArray(submission?.choiceAnswers)
                      ? submission!.choiceAnswers!.find(a => a.questionIndex === qIndex)
                      : undefined;
                  return (
                  <div key={qIndex}>
                    <Paragraph strong>
                      {qIndex + 1}. {q.question}
                      <Tag style={{ marginLeft: 8 }}>{q.score} 分</Tag>
                    </Paragraph>
                    <Radio.Group
                      value={choiceSelection[qIndex]}
                      onChange={(e) => {
                        const current = [...choiceSelection];
                        current[qIndex] = e.target.value;
                        setChoiceSelection(current);
                      }}
                      disabled={closed}
                    >
                      <Space direction="vertical">
                        {q.options.map((option, oIndex) => (
                          <Radio
                            key={oIndex}
                            value={oIndex}
                            style={{
                              color: choiceGraded
                                ? oIndex === q.answer
                                  ? '#52c41a'
                                  : answerItem?.selected === oIndex
                                    ? '#ff4d4f'
                                    : undefined
                                : undefined,
                            }}
                          >
                            {String.fromCharCode(65 + oIndex)}. {option}
                          </Radio>
                        ))}
                      </Space>
                    </Radio.Group>
                    {answerItem && renderChoiceResult(qIndex, answerItem)}
                  </div>
                  );
                })}
              </Space>
              <div style={{ marginTop: 24 }}>
                <Space>
                  <Button
                    type="primary"
                    size="large"
                    loading={submitting}
                    disabled={closed}
                    onClick={handleChoiceSubmit}
                  >
                    {submission ? '重新提交' : '提交作业'}
                  </Button>
                  {submission && (
                    <Text type="secondary">
                      提交时间：{new Date(submission.createdAt).toLocaleString()}
                    </Text>
                  )}
                </Space>
              </div>
            </Card>
          )}

          {!isTeacher && assignment.type !== AssignmentType.CHOICE && (
            <Card title="我的答案" style={{ marginTop: 24 }}>
              {submission && getStatusTag(submission.status)}
              {submission?.status === SubmissionStatus.GRADED && (
                <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
                  <Paragraph strong>得分：{submission.score} / {assignment.maxScore}</Paragraph>
                  <Paragraph strong>教师反馈：</Paragraph>
                  <Paragraph>{submission.feedback}</Paragraph>
                </div>
              )}
              <Form
                form={form}
                layout="vertical"
                onFinish={handleTextSubmit}
                style={{ marginTop: 16 }}
              >
                {assignment.type === AssignmentType.TEXT && (
                  <Form.Item name="textAnswer" label="答案" rules={[{ required: true, message: '请输入答案' }]}>
                    <Input.TextArea rows={8} placeholder="请输入你的答案" />
                  </Form.Item>
                )}
                {assignment.type === AssignmentType.ATTACHMENT && (
                  <Alert type="info" showIcon message="附件提交流程暂未开放，请联系教师提交附件。" />
                )}
                <Form.Item>
                  <Space>
                    <Button
                      type="primary"
                      htmlType="submit"
                      size="large"
                      loading={submitting}
                      disabled={closed || assignment.type === AssignmentType.ATTACHMENT}
                    >
                      {submission ? '重新提交' : '提交作业'}
                    </Button>
                    {submission && (
                      <Text type="secondary">
                        提交时间：{new Date(submission.createdAt).toLocaleString()}
                      </Text>
                    )}
                  </Space>
                </Form.Item>
              </Form>
            </Card>
          )}

          {isTeacher && (
            <Card title="学生提交" style={{ marginTop: 24 }}>
              <List
                dataSource={submissions}
                locale={{ emptyText: '暂无提交' }}
                renderItem={(sub) => (
                  <List.Item
                    actions={[
                      sub.status === SubmissionStatus.SUBMITTED &&
                        assignment.type !== AssignmentType.CHOICE && (
                        <Button type="primary" icon={<EditOutlined />} onClick={() => handleGrade(sub)}>
                          批改
                        </Button>
                      ),
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Avatar>{sub.studentId?.[0] || 'U'}</Avatar>}
                      title={
                        <Space>
                          {sub.studentId || '未知用户'}
                          {getStatusTag(sub.status)}
                          {assignment.type === AssignmentType.CHOICE && (
                            <Tag color="purple">
                              答对 {sub.correctCount ?? 0} / {assignment.questions?.length || 0} 题
                            </Tag>
                          )}
                        </Space>
                      }
                      description={
                        <Space>
                          <span>提交时间：{new Date(sub.createdAt).toLocaleString()}</span>
                          {sub.score !== null && sub.score !== undefined && <span>得分：{sub.score}</span>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
