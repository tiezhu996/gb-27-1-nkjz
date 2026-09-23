import {
  Card,
  Typography,
  Form,
  Input,
  Button,
  Space,
  Descriptions,
  Tag,
  message,
  List,
  Avatar,
  Modal,
  Row,
  Col,
  Radio,
  Alert,
  Result,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { assignmentApi } from '@/api/assignment';
import { courseApi } from '@/api/course';
import {
  Assignment,
  AssignmentType,
  SubmissionStatus,
  AssignmentSubmission,
  ChoiceQuestion,
} from '@/types/assignment';
import { useAuthStore } from '@/store/auth';
import { UserRole } from '@/types/user';

const { Title, Paragraph, Text } = Typography;

export default function AssignmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [enrolled, setEnrolled] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const { user } = useAuthStore();

  const isTeacher = user?.role === UserRole.TEACHER;
  const isChoice = assignment?.type === AssignmentType.CHOICE;
  const expired = !!assignment?.deadline && new Date(assignment.deadline).getTime() < Date.now();
  const graded = submission?.status === SubmissionStatus.GRADED;
  const showChoiceResult = isChoice && submission && graded && !editing;

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
        if (data.courseId) {
          const enrollment = await courseApi.getEnrollment(data.courseId);
          setEnrolled(!!enrollment);
        }
        const mySub = await assignmentApi.getMySubmission(id);
        setSubmission(mySub);
        setEditing(false);
        if (mySub) {
          form.setFieldsValue(
            isChoiceOf(data)
              ? { answers: mySub.choiceAnswers || [] }
              : { textAnswer: mySub.textAnswer },
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!id || !assignment) return;

    let payload: Partial<AssignmentSubmission>;
    if (assignment.type === AssignmentType.CHOICE) {
      const questions: ChoiceQuestion[] = assignment.questions || [];
      const answers: number[] = questions.map((_, index) => values.answers?.[index]);
      const missing = answers.findIndex(a => a === undefined || a === null);
      if (missing !== -1) {
        message.warning(`请完成第 ${missing + 1} 题`);
        return;
      }
      payload = { choiceAnswers: answers };
    } else {
      payload = { textAnswer: values.textAnswer };
    }

    setSubmitting(true);
    try {
      const result = await assignmentApi.submit(id, payload);
      setSubmission(result);
      setEditing(false);
      message.success(assignment.type === AssignmentType.CHOICE ? '提交成功，已自动判分' : '提交成功');
    } catch (error: any) {
      message.error(error.response?.data?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrade = (sub: AssignmentSubmission) => {
    Modal.confirm({
      title: '批改作业',
      content: (
        <div style={{ marginTop: 16 }}>
          <Paragraph strong>学生答案：</Paragraph>
          <Paragraph>{sub.textAnswer || '无文本答案'}</Paragraph>
        </div>
      ),
      okText: '批改',
      onOk: async () => {
        const score = 85;
        const feedback = '做得很好！';
        try {
          await assignmentApi.grade(sub.id, score, feedback);
          message.success('批改完成');
          loadAssignment();
        } catch {
          message.error('批改失败');
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

  const renderChoiceQuestion = (q: ChoiceQuestion, index: number) => {
    const result = submission?.choiceResults?.[index];
    const selected = submission?.choiceAnswers?.[index];

    return (
      <div key={index} style={{ marginBottom: 24 }}>
        <Space align="start">
          <Text strong>
            {index + 1}. {q.title}
          </Text>
          <Tag>{q.score} 分</Tag>
          {showChoiceResult &&
            (result?.correct ? (
              <Tag icon={<CheckCircleFilled />} color="success">
                回答正确
              </Tag>
            ) : (
              <Tag icon={<CloseCircleFilled />} color="error">
                回答错误
              </Tag>
            ))}
        </Space>

        {showChoiceResult ? (
          <div style={{ marginTop: 8 }}>
            {q.options.map((option, optIndex) => {
              const isCorrect = optIndex === q.correctOption;
              const isSelected = optIndex === selected;
              return (
                <div
                  key={optIndex}
                  style={{
                    padding: '6px 12px',
                    marginBottom: 4,
                    borderRadius: 6,
                    background: isCorrect
                      ? '#f6ffed'
                      : isSelected
                        ? '#fff2f0'
                        : 'transparent',
                    border: isCorrect
                      ? '1px solid #b7eb8f'
                      : isSelected
                        ? '1px solid #ffccc7'
                        : '1px solid transparent',
                  }}
                >
                  {isCorrect && <CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />}
                  {!isCorrect && isSelected && (
                    <CloseCircleFilled style={{ color: '#ff4d4f', marginRight: 8 }} />
                  )}
                  <Text
                    strong={isCorrect || isSelected}
                    type={isCorrect ? 'success' : isSelected ? 'danger' : undefined}
                  >
                    {String.fromCharCode(65 + optIndex)}. {option}
                  </Text>
                  {isCorrect && <Text type="success"> （正确答案）</Text>}
                  {isSelected && !isCorrect && <Text type="danger"> （你的选择）</Text>}
                </div>
              );
            })}
          </div>
        ) : (
          <Form.Item name={['answers', index]} style={{ marginTop: 8, marginBottom: 0 }}>
            <Radio.Group>
              <Space direction="vertical">
                {q.options.map((option, optIndex) => (
                  <Radio key={optIndex} value={optIndex}>
                    {String.fromCharCode(65 + optIndex)}. {option}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>
        )}
      </div>
    );
  };

  if (loading) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>加载中...</div></Card>;
  }

  if (!assignment) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>作业不存在</div></Card>;
  }

  const questions: ChoiceQuestion[] = isChoice ? assignment.questions || [] : [];
  const choiceFormVisible = isChoice && (!submission || editing);

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
              {isChoice && (
                <Descriptions.Item label="题目数量">
                  共 {questions.length} 题，提交后系统自动判分
                </Descriptions.Item>
              )}
              {assignment.deadline && (
                <Descriptions.Item label="截止时间">
                  <Space>
                    {new Date(assignment.deadline).toLocaleString()}
                    {expired && <Tag color="red">已截止</Tag>}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {!isTeacher && !enrolled && (
            <Card style={{ marginTop: 24 }}>
              <Empty description="你尚未报名该课程，无法提交作业">
                <Button type="primary" onClick={() => navigate(`/courses/${assignment.courseId}`)}>
                  去报名
                </Button>
              </Empty>
            </Card>
          )}

          {!isTeacher && enrolled && expired && (
            <Alert
              style={{ marginTop: 24 }}
              type="warning"
              message="作业已截止，不能再提交或修改答案"
              showIcon
            />
          )}

          {!isTeacher && enrolled && (
            <Card title="我的答案" style={{ marginTop: 24 }}>
              {submission && getStatusTag(submission.status)}

              {showChoiceResult && (
                <Result
                  style={{ padding: '16px 0' }}
                  status={submission.score === assignment.maxScore ? 'success' : 'info'}
                  title={
                    <Space size="large">
                      <span>
                        答对 <Text strong type="success">{submission.correctCount ?? 0}</Text> / {questions.length} 题
                      </span>
                      <span>
                        得分 <Text strong type="warning">{submission.score}</Text> / {assignment.maxScore} 分
                      </span>
                    </Space>
                  }
                  subTitle={
                    submission.gradedAt
                      ? `批改时间：${new Date(submission.gradedAt).toLocaleString()}`
                      : null
                  }
                  extra={
                    !expired &&
                    (editing ? null : (
                      <Button type="primary" onClick={() => setEditing(true)}>
                        重新作答
                      </Button>
                    ))
                  }
                />
              )}

              {submission?.status === SubmissionStatus.GRADED && !isChoice && (
                <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
                  <Paragraph strong>得分：{submission.score} / {assignment.maxScore}</Paragraph>
                  {submission.gradedAt && (
                    <Paragraph type="secondary">
                      批改时间：{new Date(submission.gradedAt).toLocaleString()}
                    </Paragraph>
                  )}
                  <Paragraph strong>教师反馈：</Paragraph>
                  <Paragraph>{submission.feedback}</Paragraph>
                </div>
              )}

              {isChoice ? (
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleSubmit}
                  style={{ marginTop: 16 }}
                >
                  {questions.map(renderChoiceQuestion)}

                  {choiceFormVisible && !expired && (
                    <Button
                      type="primary"
                      htmlType="submit"
                      size="large"
                      loading={submitting}
                    >
                      {submission ? '重新提交' : '提交作业'}
                    </Button>
                  )}
                </Form>
              ) : (
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleSubmit}
                  style={{ marginTop: 16 }}
                >
                  {assignment.type === AssignmentType.TEXT && (
                    <Form.Item name="textAnswer" label="答案" rules={[{ required: true, message: '请输入答案' }]}>
                      <Input.TextArea rows={8} placeholder="请输入你的答案" disabled={!!expired} />
                    </Form.Item>
                  )}
                  {assignment.type === AssignmentType.ATTACHMENT && (
                    <Alert
                      style={{ marginBottom: 16 }}
                      type="info"
                      showIcon
                      message="附件作业请将附件链接填写在下方答案框中，提交后等待教师批改"
                    />
                  )}
                  {!expired && (
                    <Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit" size="large" loading={submitting}>
                          {submission ? '重新提交' : '提交作业'}
                        </Button>
                      </Space>
                    </Form.Item>
                  )}
                </Form>
              )}
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
                      isChoice
                        ? sub.status === SubmissionStatus.GRADED
                          ? <Tag color="green">自动判分</Tag>
                          : null
                        : sub.status === SubmissionStatus.SUBMITTED && (
                            <Button type="primary" icon={<EditOutlined />} onClick={() => handleGrade(sub)}>
                              批改
                            </Button>
                          ),
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Avatar>{sub.student?.name?.[0] || sub.studentId?.[0] || 'U'}</Avatar>}
                      title={
                        <Space>
                          {sub.student?.name || sub.studentId || '未知用户'}
                          {getStatusTag(sub.status)}
                          {isChoice && sub.correctCount !== undefined && sub.correctCount !== null && (
                            <Tag color="blue">
                              答对 {sub.correctCount}/{questions.length} 题
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

function isChoiceOf(a: Assignment) {
  return a.type === AssignmentType.CHOICE;
}
