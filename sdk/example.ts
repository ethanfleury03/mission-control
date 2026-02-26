import { MissionControl } from './src/index';

async function example() {
  const mc = new MissionControl({
    apiKey: 'test-key',
    agentId: 'demo-agent',
    apiUrl: 'http://localhost:3001'
  });

  // Listen to events
  mc.on('connected', () => console.log('Connected to Mission Control'));
  mc.on('taskStarted', (task) => console.log('Task started:', task.id));
  mc.on('blocked', ({ message }) => console.log('Waiting for approval:', message));

  try {
    // Start a task
    const task = await mc.startTask({
      title: 'Process Daily Emails',
      description: 'Check and categorize emails from the last 24 hours',
      priority: 'medium',
      tags: ['email', 'daily']
    });

    console.log('Task created:', task.id);

    // Simulate work
    await mc.progress('Connecting to Gmail...');
    await new Promise(r => setTimeout(r, 500));

    // Log a tool call
    await mc.toolCall('gog', 
      { command: 'gmail search newer_than:1d is:unread' },
      { output: { count: 5 }, durationMs: 800 }
    );

    await mc.progress('Found 5 unread emails');

    // Check if we need approval
    const approved = await mc.block(
      'Send summary email to team?',
      { recipients: ['team@arrsys.com'], subject: 'Daily Email Summary' }
    );

    if (approved) {
      await mc.progress('Sending summary...');
      await mc.toolCall('gog',
        { command: 'gmail send', to: 'team@arrsys.com', subject: 'Summary' },
        { output: 'sent', durationMs: 1200 }
      );
      await mc.complete('Summary sent to team');
    } else {
      await mc.complete('Skipped sending summary (not approved)');
    }

  } catch (err) {
    console.error('Task failed:', err);
    await mc.fail(String(err));
  } finally {
    mc.disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  example().catch(console.error);
}
