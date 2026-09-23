import {
  Card,
  Form,
  Input,
  Button,
  message,
  Space,
  Typography,
  Select,
  DatePicker,
  Divider,
  InputNumber,
  Empty,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { assignmentApi } from '@/api/assignment';
import { AssignmentType, ChoiceQuestion } from '@/types/assignment';

const { Title } = Typography;

export default function CreateAssignment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') || '';
  const [form] = Form.useForm();
  const questionsValue: any[] = Form.useWatch('questions', form) || [];

  const onFinish = async (values: any) => {
    if (!courseId) {
      message.error('缺少课程信息');
      return;
    }

    let questions: ChoiceQuestion[] | undefined;
    if (values.type === AssignmentType.CHOICE) {
      questions = (values.questions || []).map((q: any) => ({
        title: q.title,
        options: q.options.map((o: any) => o.option),
        correctOption: q.correctOption,
        score: q.score,
      }));
    }

    try {
      const created = await assignmentApi.create({
        title: values.title,
        description: values.description,
        courseId,
        type: values.type,
        deadline: values.deadline ? values.deadline.toISOString() : undefined,
        questions,
      });
      message.success('作业发布成功');
      navigate(`/assignments/${created.id}`);
    } catch (error: any) {
      message.error(error.response?.data?.message || '发布失败');
    }
  };

  return (
    <div>
      <Title level={2}>发布作业</Title>
      <Card>
        {!courseId ? (
          <Empty description="缺少课程信息，请从课程页面进入发布作业" />
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{
              type: AssignmentType.CHOICE,
              questions: [
                {
                  score: 10,
                  options: [{ option: '' }, { option: '' }],
                },
              ],
            }}
          >
            <Form.Item name="title" label="作业标题" rules={[{ required: true, message: '请输入作业标题' }]}>
              <Input placeholder="请输入作业标题" maxLength={100} />
            </Form.Item>

            <Form.Item
              name="description"
              label="作业说明"
              rules={[{ required: true, message: '请输入作业说明' }]}
            >
              <Input.TextArea rows={3} placeholder="请输入作业说明" />
            </Form.Item>

            <Form.Item name="type" label="作业类型" rules={[{ required: true }]}>
              <Select>
                <Select.Option value={AssignmentType.CHOICE}>选择题（提交后自动判分）</Select.Option>
                <Select.Option value={AssignmentType.TEXT}>文本题（教师批改）</Select.Option>
                <Select.Option value={AssignmentType.ATTACHMENT}>附件作业（教师批改）</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="deadline" label="截止时间（可选）">
              <DatePicker showTime style={{ width: '100%' }} placeholder="选择截止时间，留空表示不限制" />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) => prev.type !== curr.type}
            >
              {({ getFieldValue }) =>
                getFieldValue('type') === AssignmentType.CHOICE ? (
                  <>
                    <Divider orientation="left">题目设置（满分自动按各题分值合计）</Divider>
                    <Form.List
                      name="questions"
                      rules={[
                        {
                          validator: async (_, questions) => {
                            if (!questions || questions.length < 1) {
                              return Promise.reject(new Error('至少添加一道题目'));
                            }
                          },
                        },
                      ]}
                    >
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(({ key, name, ...restField }) => {
                            const optionCount = questionsValue[name]?.options?.length ?? 0;
                            return (
                              <Card
                                key={key}
                                size="small"
                                style={{ marginBottom: 16 }}
                                title={`第 ${name + 1} 题`}
                                extra={
                                  fields.length > 1 ? (
                                    <MinusCircleOutlined onClick={() => remove(name)} />
                                  ) : null
                                }
                              >
                                <Form.Item
                                  {...restField}
                                  name={[name, 'title']}
                                  label="题干"
                                  rules={[{ required: true, message: '请输入题干' }]}
                                >
                                  <Input placeholder="请输入题干" />
                                </Form.Item>

                                <Form.List name={[name, 'options']}>
                                  {(optionFields, { add: addOption, remove: removeOption }) => (
                                    <>
                                      {optionFields.map((optionField, optionIndex) => (
                                        <Space
                                          key={optionField.key}
                                          align="baseline"
                                          style={{ display: 'flex' }}
                                        >
                                          <span style={{ width: 24 }}>
                                            {String.fromCharCode(65 + optionIndex)}.
                                          </span>
                                          <Form.Item
                                            {...optionField}
                                            name={[optionField.name, 'option']}
                                            rules={[{ required: true, message: '请输入选项内容' }]}
                                          >
                                            <Input placeholder="请输入选项内容" style={{ width: 360 }} />
                                          </Form.Item>
                                          {optionFields.length > 2 && (
                                            <MinusCircleOutlined
                                              onClick={() => removeOption(optionField.name)}
                                            />
                                          )}
                                        </Space>
                                      ))}
                                      <Button
                                        type="dashed"
                                        onClick={() => addOption({ option: '' })}
                                        icon={<PlusOutlined />}
                                        style={{ width: 384 }}
                                      >
                                        添加选项
                                      </Button>
                                    </>
                                  )}
                                </Form.List>

                                <Space style={{ marginTop: 16 }} size="large">
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'correctOption']}
                                    label="正确选项"
                                    rules={[{ required: true, message: '请选择正确选项' }]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <Select placeholder="选择正确选项" style={{ width: 160 }}>
                                      {Array.from({ length: optionCount }).map((_, i) => (
                                        <Select.Option key={i} value={i}>
                                          {String.fromCharCode(65 + i)}
                                        </Select.Option>
                                      ))}
                                    </Select>
                                  </Form.Item>

                                  <Form.Item
                                    {...restField}
                                    name={[name, 'score']}
                                    label="分值"
                                    rules={[{ required: true, message: '请输入分值' }]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <InputNumber min={1} precision={0} addonAfter="分" />
                                  </Form.Item>
                                </Space>
                              </Card>
                            );
                          })}
                          <Button
                            type="dashed"
                            onClick={() =>
                              add({ score: 10, options: [{ option: '' }, { option: '' }] })
                            }
                            block
                            icon={<PlusOutlined />}
                          >
                            添加题目
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </>
                ) : null
              }
            </Form.Item>

            <Form.Item style={{ marginTop: 24 }}>
              <Space>
                <Button type="primary" htmlType="submit" size="large">
                  发布作业
                </Button>
                <Button size="large" onClick={() => navigate(-1)}>
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
}
