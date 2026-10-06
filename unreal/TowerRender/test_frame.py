"""Render two frames, not ninety-six.

Checking a lighting or material change against a full turn wastes four minutes
per look. This renders the same camera positions into a separate folder so the
real delivery is never half-overwritten by an experiment.
"""
import unreal

OUT = 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/test'
START, END = 8, 10

log = unreal.log
subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
for job in list(queue.get_jobs()):
    queue.delete_job(job)

job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.set_editor_property('job_name', 'TowerTest')
job.set_editor_property('map', unreal.SoftObjectPath('/Game/Tower/Maps/TowerOrbit'))
job.set_editor_property('sequence', unreal.SoftObjectPath('/Game/Tower/Seq/OrbitSeq'))

config = job.get_configuration()
config.find_or_add_setting_by_class(unreal.MoviePipelineDeferredPassBase)
config.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_JPG)

out = config.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
out.set_editor_property('output_directory', unreal.DirectoryPath(OUT))
out.set_editor_property('output_resolution', unreal.IntPoint(1920, 1080))
out.set_editor_property('file_name_format', '{frame_number}')
out.set_editor_property('zero_pad_frame_numbers', 4)
out.set_editor_property('override_existing_output', True)
out.set_editor_property('use_custom_playback_range', True)
out.set_editor_property('custom_start_frame', START)
out.set_editor_property('custom_end_frame', END)

aa = config.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
aa.set_editor_property('spatial_sample_count', 1)
aa.set_editor_property('temporal_sample_count', 4)
aa.set_editor_property('render_warm_up_count', 32)   # let the exposure settle

log('TEST RENDER frames %d-%d -> %s' % (START, END, OUT))
subsystem.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
