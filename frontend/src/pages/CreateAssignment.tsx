import { Card, Form, Input, Select, Button, Space, Typography, InputNumber, DatePicker, message, Divider } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { assignmentApi } from '@/api/assignment';
import { AssignmentType, ChoiceQuestion } from '@/types/assignment';

const { Title, Text } = Typography;

const createQuestion = () => ({
  question: '',
  options: ['', ''],
  answer: 0,
  score: 10,
});

export default function CreateAssignment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') || '';
  const [form] = Form.useForm();
  const [type, setType] = useState<AssignmentType>(AssignmentType.TEXT);
  const [submitting, setSubmitting] = useState(false);
  const questionsValue = Form.useWatch('questions', form);

  const onFinish = async (values: any) => {
    const payload: any = {
      title: values.title,
      description: values.description || '',
      courseId: values.courseId,
      type: values.type,
      deadline: values.deadline ? values.deadline.toDate() : null,
    };

    if (values.type === AssignmentType.CHOICE) {
      const questions: ChoiceQuestion[] = (values.questions || []).map((q: any) => ({
        question: q.question,
        options: q.options,
        answer: q.answer,
        score: q.score,
      }));
      payload.questions = questions;
    } else {
      payload.maxScore = values.maxScore ?? 100;
    }

    setSubmitting(true);
    try {
      const assignment = await assignmentApi.create(payload);
      message.success('作业发布成功');
      navigate(`/assignments/${assignment.id}`);
    } catch (error: any) {
      message.error(error.response?.data?.message || '发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Title level={2}>发布作业</Title>
      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            type: AssignmentType.TEXT,
            courseId,
            maxScore: 100,
            questions: [createQuestion()],
          }}
        >
          <Form.Item name="courseId" label="所属课程 ID" rules={[{ required: true, message: '请输入所属课程 ID' }]}>
            <Input placeholder="课程 ID" disabled={!!courseId} />
          </Form.Item>

          <Form.Item name="title" label="作业标题" rules={[{ required: true, message: '请输入作业标题' }]}>
            <Input placeholder="请输入作业标题" />
          </Form.Item>

          <Form.Item name="description" label="作业说明">
            <Input.TextArea rows={3} placeholder="请输入作业说明" />
          </Form.Item>

          <Form.Item name="type" label="作业类型" rules={[{ required: true }]}>
            <Select onChange={(v) => setType(v)}>
              <Select.Option value={AssignmentType.TEXT}>文本题</Select.Option>
              <Select.Option value={AssignmentType.CHOICE}>选择题</Select.Option>
              <Select.Option value={AssignmentType.ATTACHMENT}>附件提交</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="deadline" label="截止时间">
            <DatePicker showTime style={{ width: 300 }} placeholder="选择截止时间（可选）" />
          </Form.Item>

          {type !== AssignmentType.CHOICE && (
            <Form.Item name="maxScore" label="满分" rules={[{ required: true, message: '请输入满分' }]}>
              <InputNumber min={1} style={{ width: 200 }} addonAfter="分" />
            </Form.Item>
          )}

          {type === AssignmentType.CHOICE && (
            <>
              <Divider orientation="left">选择题题目</Divider>
              <Text type="secondary">每题填写题干、两个及以上选项、正确选项和分值；满分由各题分值自动合计。</Text>
              <Form.List name="questions">
                {(fields, { add, remove }) => (
                  <div style={{ marginTop: 16 }}>
                    {fields.map((field, index) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 16 }}
                        title={`第 ${index + 1} 题`}
                        extra={
                          fields.length > 1 ? (
                            <MinusCircleOutlined onClick={() => remove(field.name)} />
                          ) : null
                        }
                      >
                        <Form.Item
                          label="题干"
                          name={[field.name, 'question']}
                          rules={[{ required: true, message: '请输入题干' }]}
                        >
                          <Input placeholder="请输入题干" />
                        </Form.Item>

                        <Form.List name={[field.name, 'options']}>
                          {(optionFields, { add: addOption, remove: removeOption }) => (
                            <div>
                              {optionFields.map((optionField, optionIndex) => (
                                <Space key={optionField.key} align="baseline" style={{ display: 'flex' }}>
                                  <Form.Item
                                    name={optionField.name}
                                    rules={[{ required: true, message: '请输入选项内容' }]}
                                  >
                                    <Input placeholder={`选项 ${String.fromCharCode(65 + optionIndex)}`} style={{ width: 360 }} />
                                  </Form.Item>
                                  {optionFields.length > 2 && (
                                    <MinusCircleOutlined onClick={() => removeOption(optionField.name)} />
                                  )}
                                </Space>
                              ))}
                              <Button type="dashed" onClick={() => addOption('')} icon={<PlusOutlined />} style={{ marginBottom: 16 }}>
                                添加选项
                              </Button>
                            </div>
                          )}
                        </Form.List>

                        <Space size="large" align="baseline">
                          <Form.Item
                            label="正确选项"
                            name={[field.name, 'answer']}
                            rules={[{ required: true }]}
                          >
                            <Select style={{ width: 120 }}>
                              {(questionsValue?.[field.name]?.options || []).map(
                                (_: string, optionIndex: number) => (
                                  <Select.Option key={optionIndex} value={optionIndex}>
                                    {String.fromCharCode(65 + optionIndex)}
                                  </Select.Option>
                                ),
                              )}
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label="分值"
                            name={[field.name, 'score']}
                            rules={[{ required: true, message: '请输入分值' }]}
                          >
                            <InputNumber min={1} addonAfter="分" />
                          </Form.Item>
                        </Space>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add(createQuestion())} icon={<PlusOutlined />} block>
                      添加题目
                    </Button>
                  </div>
                )}
              </Form.List>
            </>
          )}

          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button type="primary" htmlType="submit" size="large" loading={submitting}>
                发布作业
              </Button>
              <Button size="large" onClick={() => navigate(-1)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
