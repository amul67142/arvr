"""Run high-rise render steps one after another, then restore the look and quit.

Launched as: UnrealEditor.exe HighriseRender.uproject -ExecCmds="py C:/Users/DELL/hr_run.py"
(a path without spaces, so the console command needs no quoting).

Steps are chained by watching the render queue every editor tick rather than
through the executor's finished delegate, which did not fire from here.
Edit STEPS to choose what runs.
"""
import unreal

PY = 'C:/Users/DELL/Documents/Unreal Projects/HighriseRender/Content/Python/'
STEPS = ['hr4_orbit_id.py']          # renders, in order ('hr3_orbit_video.py' first for a fresh video)
FINALLY = 'hr5_restore.py'

subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
state = {'queue': list(STEPS), 'started': False, 'waiting': 0, 'idle_ticks': 0, 'handle': None}


def run(name, **extra):
    unreal.log('HR_RUN start %s' % name)
    with open(PY + name, encoding='utf8') as handle:
        exec(compile(handle.read(), PY + name, 'exec'), {'__name__': '__main__', **extra})


def tick(delta):
    if subsystem.is_rendering():
        state['started'] = True
        state['waiting'] = 0
        state['idle_ticks'] = 0
        return
    if state['waiting']:
        # A render was just queued: give it time to start before judging.
        state['waiting'] -= 1
        if state['waiting'] == 0:
            unreal.log_error('HR_RUN a render never started')
        return
    state['idle_ticks'] += 1
    if state['started'] and state['idle_ticks'] < 30:
        return  # let the finished render settle before the next one
    if state['queue']:
        state['started'] = False
        state['idle_ticks'] = 0
        state['waiting'] = 3000
        run(state['queue'].pop(0))
        return
    unreal.unregister_slate_post_tick_callback(state['handle'])
    run(FINALLY)
    unreal.log('HR_RUN ALL DONE')
    unreal.SystemLibrary.quit_editor()


# The orbit camera and sequence first, without rendering: the ID pass needs
# the very camera the video was shot with.
run('hr3_orbit_video.py', HR_RENDER=False)
state['handle'] = unreal.register_slate_post_tick_callback(tick)
unreal.log('HR_RUN chained %s then %s' % (STEPS, FINALLY))
