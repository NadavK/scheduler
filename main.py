#!/usr/bin/env python3
"""
Standalone GPIO Scheduler Service
Manages scheduled GPIO outputs with web interface
"""
import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
from collections import defaultdict
from contextlib import nullcontext
from datetime import datetime, timedelta, UTC
from io import BytesIO
from pathlib import Path
from typing import Dict, Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from astral import LocationInfo
from astral.sun import sun
from flask import Flask, request, jsonify, send_from_directory, send_file, has_app_context, g
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_session import Session
from flask_sqlalchemy import SQLAlchemy
from gpiozero import LED
from werkzeug.security import generate_password_hash, check_password_hash

VERSION = "2.3.5"
local_tz = ZoneInfo("Asia/Jerusalem")

app = Flask(__name__)

# Configuration
DATA_DIR = Path('/home/lechu/scheduler')
DATA_DIR.mkdir(exist_ok=True)

#locations for sunset calculation
LOCATION_LAT = 32.18076
LOCATION_LON = 34.86925

# Configure SQLAlchemy for SQLite
DB_PATH = DATA_DIR / 'scheduler.sqlite'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.environ.get('SECRET_KEY', '944d4951d2ba60e186bacae35e56aeab65b69e04d8770cd293d068b7f2afe50e')

# Configure server-side sessions
app.config['SESSION_TYPE'] = 'sqlalchemy'
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(weeks=520)

# Initialize SQLAlchemy
db = SQLAlchemy(app)

# Configure session with db
app.config['SESSION_SQLALCHEMY'] = db
app.config['SESSION_SQLALCHEMY_TABLE'] = 'flask_sessions'

# Initialize Flask-Session
Session(app)

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logging.getLogger("werkzeug").setLevel(logging.WARN)

# Rate limiting configuration
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_DURATION = 300  # 5 minutes in seconds
login_attempts = defaultdict(list)
login_attempts_lock = threading.Lock()

# Global scheduler
scheduler = BackgroundScheduler()
scheduler.start()

server_timestamp: datetime = datetime.now()      # default value for stale data

# Store LED objects to prevent them from being garbage collected
led_instances: Dict[int, LED] = {}

# Day mapping
# DAY_MAP = {
#     'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3,
#     'thu': 4, 'fri': 5, 'sat': 6
# }


# Database Models
class UserModel(db.Model):
    __tablename__ = 'users'
    username = db.Column(db.String(80), primary_key=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='user', nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(UTC))


class OutputModel(db.Model):
    __tablename__ = 'outputs'
    gpio = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(UTC))


class ScheduleModel(db.Model):
    __tablename__ = 'schedules'
    id = db.Column(db.String(50), primary_key=True)
    gpio = db.Column(db.Integer, nullable=False)
    day = db.Column(db.String(10), nullable=False)
    fixed = db.Column(db.Boolean, default=True, nullable=False)  # True for fixed time, False for sunset-based
    time = db.Column(db.String(10), nullable=False)
    action = db.Column(db.String(10), nullable=False)
    enabled = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    def description(self):
        return f"GPIO {self.gpio} {'ON' if self.action == 'on' else 'OFF'} @ {self.day} {self.time}"


class GPIOStateModel(db.Model):
    __tablename__ = 'gpio_states'
    gpio = db.Column(db.Integer, primary_key=True)
    state = db.Column(db.Boolean, nullable=False)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class MetadataModel(db.Model):
    __tablename__ = 'metadata'
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ScheduleChangeHistoryModel(db.Model):
    __tablename__ = 'schedule_change_history'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)
    username = db.Column(db.String(80), nullable=False)
    action = db.Column(db.String(20), nullable=False)  # 'create', 'update', 'delete', 'bulk_update'
    schedule_id = db.Column(db.String(50), nullable=True)  # NULL for bulk operations
    changes = db.Column(db.Text, nullable=False)  # JSON string of changes

    def __repr__(self):
        return f'<ScheduleChangeHistory {self.id}: {self.action} by {self.username}>'


class ExecutionHistoryModel(db.Model):
    __tablename__ = 'execution_history'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)
    schedule_id = db.Column(db.String(50), nullable=True)
    gpio = db.Column(db.Integer, nullable=False)
    action = db.Column(db.String(10), nullable=False)
    execution_type = db.Column(db.String(20), nullable=False)  # 'manual' or 'scheduled'
    username = db.Column(db.String(80), nullable=True)
    success = db.Column(db.Boolean, nullable=False)
    error_message = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f'<ExecutionHistory {self.id}: GPIO {self.gpio} -> {self.action} ({self.execution_type})>'

@app.before_request
def log_request_started():
    g.request_start_time = time.time()
    username = current_user.username if current_user.is_authenticated else "anonymous"
    logger.info("In: %s %s user: %s", request.method, request.path, username)

@app.after_request
def log_request_finished(response):
    duration_ms = (time.time() - g.request_start_time) * 1000
    logger.info("Out: %s %s -> %s in %.1f ms",request.method, request.path, response.status_code, duration_ms,)
    return response

def parse_time_offset(time_str):
    """
    Parse time string as offset in minutes.
    Format: "+HH:MM" or "-HH:MM"
    Returns: offset in minutes (positive or negative)
    """
    if not time_str or len(time_str) < 6:
        return 0

    sign = -1 if time_str[0] == '-' else 1
    if time_str[0] in ['-', '+']:
        time_str = time_str[1:]  # Remove +/- sign
    hour, minute = map(int, time_str.split(':'))
    return sign * (hour * 60 + minute)

def get_sunset_time(date=None):
    """Get sunset time for the configured location"""
    if date is None:
        date = datetime.now(local_tz).date()

    try:
        location = LocationInfo("Custom", "Israel", "Asia/Jerusalem", LOCATION_LAT, LOCATION_LON)
        s = sun(location.observer, date=date, tzinfo=local_tz)
        return s['sunset']
    except Exception as e:
        logger.error(f"Error calculating sunset time: {e}")
        # Fallback to approximate sunset time (18:00)
        return datetime.combine(date, datetime.min.time().replace(hour=18, minute=0)).replace(tzinfo=local_tz)


def calculate_sunset_schedule_time(sunset_time, offset_str):
    """
    Calculate actual time for a sunset-based schedule.

    Args:
        sunset_time: datetime of sunset
        offset_str: offset string like "+00:30" or "-00:15"

    Returns:
        datetime of the scheduled time
    """
    offset_minutes = parse_time_offset(offset_str)
    return sunset_time + timedelta(minutes=offset_minutes)


def recalculate_sunset_schedules():
    """Recalculate all sunset-based schedules for today"""
    try:
        logger.info("Recalculating sunset-based schedules")
        today = datetime.now(local_tz)

        # Get sunset times
        sunset = get_sunset_time(today.date())

        logger.info(f"Sunset today: {sunset.strftime('%H:%M')}")

        # Get all enabled sunset-based schedules (fixed=False)
        sunset_schedules = ScheduleModel.query.filter_by(fixed=False, enabled=True, day=today.strftime('%a').lower()[:3]).all()
        if not sunset_schedules:
            logger.info("No sunset-based schedules found")
            return True

        scheduled_count = 0
        skipped_count = 0
        for schedule in sunset_schedules:
            target_time = calculate_sunset_schedule_time(sunset, schedule.time)
            if target_time > today:
                reschedule_sunset_job(schedule, target_time)
                scheduled_count += 1
                logger.debug(f"Scheduled for today: {schedule.description()} (per sunset: {target_time.strftime('%H:%M')})")
            else:
                skipped_count += 1
                logger.info(f"Skipped (past): {schedule.description()} (per sunset: {target_time.strftime('%H:%M')})")

        logger.info(f"Sunset schedules: {scheduled_count} scheduled, {skipped_count} skipped (past time)")
        return True

    except Exception as e:
        logger.error(f"Error recalculating sunset schedules: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def reschedule_sunset_job(schedule: ScheduleModel, target_time):
    """Reschedule a single sunset-based job for a specific datetime"""
    try:
        job_id = f"schedule_{schedule.id}"
        state = (schedule.action == 'on')

        # Remove existing job if any
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)

        # Add new one-time job for the calculated time
        scheduler.add_job(
            func=set_gpio,
            trigger='date',
            run_date=target_time,
            args=[schedule.gpio, state, True, schedule.id, 'scheduled'],
            id=job_id,
            name=f"{schedule.description()} (per sunset: {target_time.strftime('%H:%M')}) ({job_id})",
            replace_existing=True,
            misfire_grace_time = 600
        )

        logger.debug(f"Scheduled sunset job {job_id} for {target_time.strftime('%Y-%m-%d %H:%M:%S')}")
        return True

    except Exception as e:
        logger.error(f"Error rescheduling sunset job: {e}")
        return False

# User class for Flask-Login
class User(UserMixin):
    """User class for Flask-Login"""

    def __init__(self, username, role='user'):
        self.id = username
        self.username = username
        self.role = role

    def is_admin(self):
        return self.role == 'admin'


@login_manager.user_loader
def load_user(username):
    user = db.session.get(UserModel, username)
    if user:
        return User(user.username, user.role)
    return None


@login_manager.unauthorized_handler
def unauthorized():
    """Handle unauthorized access"""
    return jsonify({'error': 'Unauthorized'}), 401


def backup_database():
    """Create a backup of the database"""
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = DATA_DIR / f'scheduler_backup_{timestamp}.sqlite'

        if DB_PATH.exists():
            shutil.copy2(DB_PATH, backup_path)

            # Keep only last 10 backups
            backups = sorted(
                DATA_DIR.glob('scheduler_backup_*.sqlite'),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            for old_backup in backups[10:]:
                old_backup.unlink()
                logger.info(f"Removed old backup: {old_backup.name}")

            logger.info(f"Created database backup: {backup_path.name}")
            return True
    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        return False


def log_schedule_change(username: str, action: str, schedule_id: Optional[str], changes: dict):
    """Log a schedule change to history"""
    try:
        history = ScheduleChangeHistoryModel(
            username=username,
            action=action,
            schedule_id=schedule_id,
            changes=json.dumps(changes, ensure_ascii=False)
        )
        db.session.add(history)
        db.session.commit()
        logger.info(f"Logged schedule change: {action} by {username}")
    except Exception as e:
        logger.error(f"Error logging schedule change: {e}")
        db.session.rollback()


def log_execution(gpio: int, action: str, success: bool, execution_type: str, schedule_id: Optional[str] = None, username: Optional[str] = None, error_message: Optional[str] = None):
    """Log a GPIO execution to history"""
    try:
        execution = ExecutionHistoryModel(schedule_id=schedule_id, gpio=gpio, action=action, execution_type=execution_type, username=username, success=success, error_message=error_message)
        db.session.add(execution)
        db.session.commit()
    except Exception as e:
        logger.error(f"Error logging execution: {e}")
        db.session.rollback()


def set_gpio(output: int, state: bool, save_state: bool = True, schedule_id: Optional[str] = None, execution_type: Optional[str] = None, username: Optional[str] = None):
    """
    Set GPIO state and persist state

    Args:
        output: GPIO pin number
        state: True for ON, False for OFF
        save_state: Whether to save the state to disk
        schedule_id: Schedule ID if triggered by schedule
        execution_type: 'manual' or 'scheduled'
        username: Username for manual executions
    """
    with nullcontext() if has_app_context() else app.app_context():
        action = 'on' if state else 'off'
        try:
            logger.info(f"Setting GPIO {output} to {action.upper()}")
            if output not in led_instances:
                led_instances[output] = LED(output)
            led_instances[output].value = state

            # Save state to disk for restoration on restart
            if save_state:
                save_gpio_state(output, state)

            # Log execution
            if execution_type:
                log_execution(
                    schedule_id=schedule_id,
                    gpio=output,
                    action=action,
                    execution_type=execution_type,
                    username=username,
                    success=True
                )

            return True
        except Exception as e:
            logger.error(f"Error setting GPIO {output} to {action.upper()}: {e}")

            # Log failed execution
            if execution_type:
                log_execution(
                    schedule_id=schedule_id,
                    gpio=output,
                    action=action,
                    execution_type=execution_type,
                    username=username,
                    success=False,
                    error_message=str(e)
                )
            return False
        # finally:
        #     if schedule_id:
        #         try:
        #             scheduler.remove_job(f"schedule_{schedule_id}")
        #         except:
        #             logger.info(f"Failed to remove job for schedule {schedule_id}")
        #     return rc

def get_gpio(output: int) -> bool:
    """Get current GPIO state"""
    if output not in led_instances:
        led_instances[output] = LED(output)
    return led_instances[output].value

# def load_gpio_states() -> Dict[int, bool]:
#     """Load last known GPIO states"""
#     states = load_json(GPIO_STATE_FILE, {})
#     # Convert string keys back to integers
#     return {int(gpio): state for gpio, state in states.items()}


def save_gpio_state(gpio: int, state: bool):
    """Save a single GPIO state to database"""
    try:
        gpio_state = db.session.get(GPIOStateModel, gpio)
        if gpio_state:
            gpio_state.state = state
            gpio_state.updated_at = datetime.now(UTC)
        else:
            gpio_state = GPIOStateModel(gpio=gpio, state=state)
            db.session.add(gpio_state)
        db.session.commit()
    except Exception as e:
        logger.error(f"Error saving GPIO state: {e}")
        db.session.rollback()


def restore_gpio_states():
    """Restore all GPIOs to their last known state on startup"""
    try:
        logger.info("Restoring GPIO states from last session...")

        gpio_states = GPIOStateModel.query.all()
        outputs = OutputModel.query.all()
        configured_gpios = {output.gpio for output in outputs}

        restored_count = 0
        for gpio_state in gpio_states:
            if gpio_state.gpio in configured_gpios:
                if set_gpio(gpio_state.gpio, gpio_state.state, save_state=False):
                    restored_count += 1
                    logger.debug(f"Restored GPIO {gpio_state.gpio} to {'ON' if gpio_state.state else 'OFF'}")
            else:
                logger.info(f"Skipping GPIO {gpio_state.gpio} - no longer in configuration")

        logger.info(f"Restored {restored_count} GPIO states")
        return True

    except Exception as e:
        logger.error(f"Error restoring GPIO states: {e}")
        return False

def get_client_ip() -> str:
    """Get client IP address"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr or 'unknown'


def is_rate_limited(ip: str) -> bool:
    """Check if IP is rate limited for login attempts"""
    with login_attempts_lock:
        now = time.time()

        # Clean up old attempts (older than lockout duration)
        login_attempts[ip] = [
            attempt_time for attempt_time in login_attempts[ip]
            if now - attempt_time < LOGIN_LOCKOUT_DURATION
        ]

        # Check if max attempts exceeded
        if len(login_attempts[ip]) >= MAX_LOGIN_ATTEMPTS:
            oldest_attempt = min(login_attempts[ip])
            time_remaining = LOGIN_LOCKOUT_DURATION - (now - oldest_attempt)
            if time_remaining > 0:
                logger.warning(f"Rate limit exceeded for IP {ip}. {time_remaining:.0f}s remaining")
                return True
            else:
                # Lockout period has passed, clear attempts
                login_attempts[ip] = []

        return False


def record_login_attempt(ip: str):
    """Record a failed login attempt"""
    with login_attempts_lock:
        login_attempts[ip].append(time.time())


def clear_login_attempts(ip: str):
    """Clear login attempts for successful login"""
    with login_attempts_lock:
        if ip in login_attempts:
            del login_attempts[ip]


def get_schedules_timestamp() -> datetime:
    """Get the last update timestamp for schedules"""
    global server_timestamp
    try:
        metadata = db.session.get(MetadataModel, 'schedules_timestamp')
        if metadata:
            server_timestamp = datetime.fromisoformat(metadata.value)
            return server_timestamp
    except Exception as e:
        logger.error(f"Error getting schedules timestamp: {e}")
    return server_timestamp


def set_schedules_timestamp():
    """Update the schedules timestamp"""
    global server_timestamp
    try:
        server_timestamp = datetime.now()
        metadata = db.session.get(MetadataModel, 'schedules_timestamp')
        if metadata:
            metadata.value = server_timestamp.isoformat()
            metadata.updated_at = datetime.now(UTC)
        else:
            metadata = MetadataModel(
                key='schedules_timestamp',
                value=server_timestamp.isoformat()
                    )
            db.session.add(metadata)
        db.session.commit()
    except Exception as e:
        logger.error(f"Error setting schedules timestamp: {e}")
        db.session.rollback()


def authenticate_user(username: str, password: str) -> Optional[User]:
    """Authenticate user and return User object"""
    user = db.session.get(UserModel, username)
    if user and check_password_hash(user.password_hash, password):
        return User(user.username, user.role)
    return None


def require_admin(f):
    """Decorator to require admin role"""

    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'error': 'Unauthorized'}), 401
        if not current_user.is_admin():
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)

    decorated_function.__name__ = f.__name__
    return decorated_function

def schedule_job(schedule: ScheduleModel):
    """Schedule a job using APScheduler"""
    try:
        # Skip disabled schedules
        if not schedule.enabled:
            logger.info(f"Skipping disabled schedule: {schedule.description()}")
            return False

        if not schedule.fixed:
            # Sunset schedules are handled by daily recalculation
            # Don't schedule them here, just acknowledge
            logger.info(f"Sunset schedule {schedule.description()} will be calculated at midnight")
            return True

        # schedule_id = schedule['id']
        # gpio = schedule['gpio']
        # day = schedule['day']
        # time_str = schedule['time']
        # action = schedule['action']

        # Parse time
        hour, minute = map(int, schedule.time.split(':'))

        # Get the day-of-week number
        #day_of_week = DAY_MAP.get(day)
        # if day_of_week is None:
        #     logger.error(f"Invalid day: {day}")
        #     return False

        # Convert action to boolean states
        state = (schedule.action == 'on')

        # Create cron trigger
        trigger = CronTrigger(day_of_week=schedule.day, hour=hour, minute=minute, timezone=local_tz)

        # Add a job to the scheduler
        job_id = f"schedule_{schedule.id}"

        # Remove the existing job if it exists. I did this to just reduce logs, but it didn't help
        # if scheduler.get_job(job_id):
        #     scheduler.remove_job(job_id)

        # Add a new job with schedule_id parameter
        scheduler.add_job(
            func=set_gpio,
            trigger=trigger,
            args=[schedule.gpio, state, True, schedule.id, 'scheduled'],  # Pass schedule_id for logging
            id=job_id,
            name=schedule.description() + f' ({job_id})',
            replace_existing=True,
            misfire_grace_time=600,
        )

        logger.debug(f"Scheduled job {job_id}: {schedule.description()}")
        return True

    except Exception as e:
        logger.error(f"Error scheduling job: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def sync_schedules():
    """Sync all schedules to APScheduler"""
    try:
        # Get all existing schedule job IDs
        existing_jobs = {job.id for job in scheduler.get_jobs() if job.id.startswith('schedule_')}

        # Schedule all current schedules
        schedules = ScheduleModel.query.all()
        current_job_ids = set()
        for schedule in schedules:
            # schedule_dict = {
            #     'id': schedule.id,
            #     'gpio': schedule.gpio,
            #     'day': schedule.day,
            #     'time': schedule.time,
            #     'action': schedule.action,
            #     'enabled': schedule.enabled,
            #     'fixed': schedule.fixed
            # }
            #if schedule_job(schedule_dict):
            if schedule_job(schedule):
                if schedule.enabled:
                    current_job_ids.add(f"schedule_{schedule.id}")

        # Remove jobs that no longer have schedules
        for job_id in existing_jobs - current_job_ids:
            scheduler.remove_job(job_id)
            logger.info(f"Removed obsolete job: {job_id}")

        logger.info(f"Synced {len(schedules)} schedules")
        return True

    except Exception as e:
        logger.error(f"Error syncing schedules: {e}")
        return False


def parse_optional_datetime(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO datetime string if present"""
    if not value:
        return None
    return datetime.fromisoformat(value)

def format_local_datetime(value: Optional[datetime]) -> Optional[str]:
    """Format a datetime in the server local timezone as a display string."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(local_tz).strftime('%d/%m/%Y %H:%M:%S')

def build_backup_payload() -> dict:
    """Build a backup payload for export"""
    history_limit = 1000
    users = UserModel.query.order_by(UserModel.username.asc()).all()
    outputs = OutputModel.query.order_by(OutputModel.gpio.asc()).all()
    schedules = ScheduleModel.query.order_by(ScheduleModel.id.asc()).all()
    gpio_states = GPIOStateModel.query.order_by(GPIOStateModel.gpio.asc()).all()
    metadata = MetadataModel.query.order_by(MetadataModel.key.asc()).all()
    change_history = list(reversed(ScheduleChangeHistoryModel.query.order_by(ScheduleChangeHistoryModel.id.desc()).limit(history_limit).all()))
    execution_history = list(reversed(ExecutionHistoryModel.query.order_by(ExecutionHistoryModel.id.desc()).limit(history_limit).all()))

    return {
        'version': VERSION,
        'exported_at': datetime.now(local_tz).isoformat(),
        'data': {
            'users': [{
                'username': user.username,
                'password_hash': user.password_hash,
                'role': user.role,
                'created_at': user.created_at.isoformat() if user.created_at else None
            } for user in users],
            'outputs': [{
                'gpio': output.gpio,
                'name': output.name,
                'created_at': output.created_at.isoformat() if output.created_at else None
            } for output in outputs],
            'schedules': [{
                'id': schedule.id,
                'gpio': schedule.gpio,
                'day': schedule.day,
                'fixed': schedule.fixed,
                'time': schedule.time,
                'action': schedule.action,
                'enabled': schedule.enabled,
                'created_at': schedule.created_at.isoformat() if schedule.created_at else None,
                'updated_at': schedule.updated_at.isoformat() if schedule.updated_at else None
            } for schedule in schedules],
            'gpio_states': [{
                'gpio': gpio_state.gpio,
                'state': gpio_state.state,
                'updated_at': gpio_state.updated_at.isoformat() if gpio_state.updated_at else None
            } for gpio_state in gpio_states],
            'metadata': [{
                'key': item.key,
                'value': item.value,
                'updated_at': item.updated_at.isoformat() if item.updated_at else None
            } for item in metadata],
            'schedule_change_history': [{
                'id': item.id,
                'timestamp': item.timestamp.isoformat() if item.timestamp else None,
                'username': item.username,
                'action': item.action,
                'schedule_id': item.schedule_id,
                'changes': json.loads(item.changes)
            } for item in change_history],
            'execution_history': [{
                'id': item.id,
                'timestamp': item.timestamp.isoformat() if item.timestamp else None,
                'schedule_id': item.schedule_id,
                'gpio': item.gpio,
                'action': item.action,
                'execution_type': item.execution_type,
                'username': item.username,
                'success': item.success,
                'error_message': item.error_message
            } for item in execution_history]
        }
    }


def restore_backup_payload(payload: dict) -> dict:
    """Restore logical backup payload into the database"""
    if not isinstance(payload, dict):
        raise ValueError("Backup payload must be a JSON object")

    data = payload.get('data', payload)
    if not isinstance(data, dict):
        raise ValueError("Backup payload is missing a valid 'data' section")

    users_data = data.get('users', [])
    outputs_data = data.get('outputs', [])
    schedules_data = data.get('schedules', [])
    gpio_states_data = data.get('gpio_states', [])
    metadata_data = data.get('metadata', [])
    change_history_data = data.get('schedule_change_history', [])
    execution_history_data = data.get('execution_history', [])

    backup_database()

    try:
        scheduler.remove_all_jobs()
        ExecutionHistoryModel.query.delete()
        ScheduleChangeHistoryModel.query.delete()
        ScheduleModel.query.delete()
        GPIOStateModel.query.delete()
        OutputModel.query.delete()
        MetadataModel.query.delete()
        UserModel.query.delete()
        db.session.commit()

        for user in users_data:
            db.session.add(UserModel(
                username=user['username'],
                password_hash=user['password_hash'],
                role=user.get('role', 'user'),
                created_at=parse_optional_datetime(user.get('created_at')) or datetime.now(UTC)
            ))

        for output in outputs_data:
            db.session.add(OutputModel(
                gpio=output['gpio'],
                name=output['name'],
                created_at=parse_optional_datetime(output.get('created_at')) or datetime.now(UTC)
            ))

        for schedule in schedules_data:
            db.session.add(ScheduleModel(
                id=schedule['id'],
                gpio=schedule['gpio'],
                day=schedule['day'],
                fixed=schedule.get('fixed', True),
                time=schedule['time'],
                action=schedule['action'],
                enabled=schedule.get('enabled', True),
                created_at=parse_optional_datetime(schedule.get('created_at')) or datetime.now(UTC),
                updated_at=parse_optional_datetime(schedule.get('updated_at')) or datetime.now(UTC)
            ))

        for gpio_state in gpio_states_data:
            db.session.add(GPIOStateModel(
                gpio=gpio_state['gpio'],
                state=gpio_state['state'],
                updated_at=parse_optional_datetime(gpio_state.get('updated_at')) or datetime.now(UTC)
            ))

        for item in metadata_data:
            db.session.add(MetadataModel(
                key=item['key'],
                value=item['value'],
                updated_at=parse_optional_datetime(item.get('updated_at')) or datetime.now(UTC)
            ))

        for item in change_history_data:
            db.session.add(ScheduleChangeHistoryModel(
                id=item.get('id'),
                timestamp=parse_optional_datetime(item.get('timestamp')) or datetime.now(UTC),
                username=item['username'],
                action=item['action'],
                schedule_id=item.get('schedule_id'),
                changes=json.dumps(item.get('changes', {}), ensure_ascii=False)
            ))

        for item in execution_history_data:
            db.session.add(ExecutionHistoryModel(
                id=item.get('id'),
                timestamp=parse_optional_datetime(item.get('timestamp')) or datetime.now(UTC),
                schedule_id=item.get('schedule_id'),
                gpio=item['gpio'],
                action=item['action'],
                execution_type=item['execution_type'],
                username=item.get('username'),
                success=item['success'],
                error_message=item.get('error_message')
            ))

        db.session.commit()

        get_schedules_timestamp()
        set_schedules_timestamp()
        sync_schedules()
        recalculate_sunset_schedules()
        restore_gpio_states()

        logger.info("Backup import completed: users=%s outputs=%s schedules=%s changes=%s executions=%s", len(users_data), len(outputs_data), len(schedules_data), len(change_history_data), len(execution_history_data)        )
        return {'users': len(users_data), 'outputs': len(outputs_data), 'schedules': len(schedules_data), 'gpio_states': len(gpio_states_data), 'metadata': len(metadata_data), 'schedule_change_history_restored': len(change_history_data), 'execution_history_restored': len(execution_history_data)}

    except Exception:
        db.session.rollback()
        raise


# API Routes - Authentication
@app.route('/api/login', methods=['POST'])
def login():
    """Login endpoint with rate limiting"""
    client_ip = get_client_ip()

    # Check rate limiting
    if is_rate_limited(client_ip):
        return jsonify({
            'error': 'Too many failed login attempts. Please try again in a few minutes.',
            'rate_limited': True
        }), 429

    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    user = authenticate_user(username, password)

    if user:
        # Successful login - clear attempts
        clear_login_attempts(client_ip)
        login_user(user, remember=True, duration=timedelta(weeks=520))
        logger.info(f"Successful login for user '{username}' from {client_ip}")
        return jsonify({
            'success': True,
            'username': user.username,
            'role': user.role
        })

    # Failed login - record attempt
    record_login_attempt(client_ip)

    # Calculate remaining attempts
    with login_attempts_lock:
        attempts_count = len(login_attempts[client_ip])
        remaining = MAX_LOGIN_ATTEMPTS - attempts_count

    logger.warning(f"Failed login attempt for user '{username}' from {client_ip}. Remaining attempts: {remaining}")

    return jsonify({'error': 'Invalid credentials', 'remaining_attempts': max(0, remaining)}), 401


@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    """Logout endpoint"""
    username = current_user.username
    logout_user()
    logger.info(f"User '{username}' logged out")
    return jsonify({'success': True})


@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check authentication status"""
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'username': current_user.username,
            'role': current_user.role
        })
    return jsonify({'authenticated': False})


# API Routes - Outputs
@app.route('/api/outputs', methods=['GET'])
@login_required
def get_outputs():
    """Get all configured GPIO outputs"""
    outputs = OutputModel.query.all()
    return jsonify([{
        'gpio': output.gpio,
        'name': output.name,
        'state': get_gpio(output.gpio)
    } for output in outputs])


@app.route('/api/outputs', methods=['POST'])
@login_required
def update_outputs():
    """Update GPIO output configuration"""
    try:
        outputs_data = request.json

        # Create backup before major changes
        backup_database()

        # Get existing GPIOs
        existing_gpios = {output.gpio for output in OutputModel.query.all()}
        new_gpios = {output['gpio'] for output in outputs_data}

        # Remove deleted outputs
        for gpio in existing_gpios - new_gpios:
            OutputModel.query.filter_by(gpio=gpio).delete()
            # Clean up state
            GPIOStateModel.query.filter_by(gpio=gpio).delete()
            logger.info(f"Removed output GPIO {gpio}")

        # Add or update outputs
        for output_data in outputs_data:
            gpio = output_data['gpio']
            name = output_data['name']

            output = db.session.get(OutputModel, gpio)
            if output:
                output.name = name
            else:
                output = OutputModel(gpio=gpio, name=name)
                db.session.add(output)

        db.session.commit()
        logger.info(f"User '{current_user.username}' updated outputs")
        return jsonify({'success': True})

    except Exception as e:
      logger.error(f"Error updating outputs: {e}")
      db.session.rollback()
      return jsonify({'error': str(e)}), 500


@app.route('/api/outputs/<int:gpio>/control', methods=['POST'])
@login_required
def control_output(gpio):
    """Manually control a GPIO output"""
    try:
        data = request.json
        state = data.get('state', False)

        if set_gpio(gpio, state, execution_type='manual', username=current_user.username):
            logger.info(f"User '{current_user.username}' manually set GPIO {gpio} to {state}")
            return jsonify({'success': True, 'gpio': gpio, 'state': state})

        return jsonify({'error': 'Failed to set GPIO'}), 500

    except Exception as e:
        logger.error(f"Error controlling output: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sunset', methods=['GET'])
@login_required
def get_sunset_info():
    """Get sunset time for today"""
    try:
        today = datetime.now(local_tz).date()
        sunset_today = get_sunset_time(today)

        return jsonify({
            'today': {
                'date': today.isoformat(),
                'sunset': sunset_today.strftime('%H:%M'),
                'sunset_full': sunset_today.isoformat()
            },
            'timezone': str(local_tz),
            'location': {
                'lat': LOCATION_LAT,
                'lon': LOCATION_LON
            }
        })
    except Exception as e:
        logger.error(f"Error getting sunset info: {e}")
        return jsonify({'error': str(e)}), 500

# API Routes - Schedules
@app.route('/api/schedules', methods=['GET'])
@login_required
def get_schedules():
    """Get all schedules """
    schedules = ScheduleModel.query.all()
    timestamp = get_schedules_timestamp()

    return jsonify({
        'timestamp': timestamp.isoformat(),
        'schedules': [{
            'id': s.id,
            'gpio': s.gpio,
            'day': s.day,
            'time': s.time,
            'action': s.action,
            'enabled': s.enabled,
            'fixed': s.fixed
        } for s in schedules]
    })


@app.route('/api/schedules', methods=['POST'])
@login_required
def update_schedules():
    """Update all schedules with concurrency protection"""
    try:
        data = request.json

        # Extract schedules and timestamp from request
        if isinstance(data, dict):
            schedules_data = data.get('schedules', [])
            client_timestamp = data.get('timestamp')
        else:
            schedules_data = data
            client_timestamp = None

        if not isinstance(schedules_data, list):
            logger.warning(f'Invalid schedules data format: {data}')
            return jsonify({'error': 'Invalid data format'}), 400

        # Validate schedules
        seen = set()
        for schedule in schedules_data:
            required_fields = ['id', 'gpio', 'day', 'time', 'action']
            if not all(field in schedule for field in required_fields):
                logger.warning(f'Invalid schedules data format: {data}')
                return jsonify({'error': 'Missing required fields in schedule'}), 400

            # Ensure enabled field exists (default to True)
            if 'enabled' not in schedule:
                schedule['enabled'] = True
            if 'fixed' not in schedule:
                schedule['fixed'] = True

            # Create a unique key for duplicate detection
            schedule_key = (schedule['gpio'], schedule['day'], schedule['time'], schedule['fixed']) # Ignore the action
            if schedule_key in seen:
                logger.warning(f"Duplicate schedule detected: GPIO {schedule["gpio"]} on {schedule["day"]} at {schedule["time"]}")
                return jsonify({
                    'error': f'Duplicate schedule found: Output {schedule["gpio"]} on {schedule["day"]} at {schedule["time"]}'
                }), 400
            seen.add(schedule_key)

        # Check timestamp for conflicts
        if client_timestamp:
            try:
                client_dt = datetime.fromisoformat(client_timestamp)
                if server_timestamp > client_dt:
                    logger.warning(f"Rejected stale update. Client: {client_timestamp}, Server: {server_timestamp}")
                    return jsonify({
                        'error': f'Your data is outdated. Server has newer changes from {server_timestamp}. Please refresh and try again.'
                    }), 409
            except (ValueError, TypeError) as e:
                logger.error(f"Invalid timestamp format: {e}")
                return jsonify({'error': 'Invalid timestamp format'}), 400

        # Create backup before major changes
        backup_database()

        # Load old schedules for change tracking
        old_schedules = {s.id: s for s in ScheduleModel.query.all()}

        # Track changes
        changes = {
            'added': [],
            'updated': [],
            'deleted': [],
            'total_count': len(schedules_data)
        }

        # Identify changes
        new_schedule_ids = {s['id'] for s in schedules_data}
        old_schedule_ids = set(old_schedules.keys())

        # Deleted schedules
        for schedule_id in old_schedule_ids - new_schedule_ids:
            old = old_schedules[schedule_id]
            changes['deleted'].append({
                'id': schedule_id,
                'gpio': old.gpio,
                'day': old.day,
                'time': old.time,
                'action': old.action
            })

        # Added and updated schedules
        for schedule_data in schedules_data:
            schedule_id = schedule_data['id']
            if schedule_id not in old_schedule_ids:
                # New schedule
                changes['added'].append({
                    'id': schedule_id,
                    'gpio': schedule_data['gpio'],
                    'day': schedule_data['day'],
                    'time': schedule_data['time'],
                    'action': schedule_data['action'],
                    'enabled': schedule_data.get('enabled', True),
                    'fixed': schedule_data.get('fixed', True)
                })
            else:
                # Check if updated
                old = old_schedules[schedule_id]
                if (old.gpio != schedule_data['gpio'] or
                    old.day != schedule_data['day'] or
                    old.time != schedule_data['time'] or
                    old.action != schedule_data['action'] or
                    old.enabled != schedule_data.get('enabled', True) or
                    old.fixed != schedule_data.get('fixed', True)):

                    changes['updated'].append({
                        'id': schedule_id,
                        'old': {
                            'gpio': old.gpio,
                            'day': old.day,
                            'time': old.time,
                            'action': old.action,
                            'enabled': old.enabled,
                            'fixed': old.fixed
                        },
                        'new': {
                            'gpio': schedule_data['gpio'],
                            'day': schedule_data['day'],
                            'time': schedule_data['time'],
                            'action': schedule_data['action'],
                            'enabled': schedule_data.get('enabled', True),
                            'fixed': schedule_data.get('fixed', True)
                        }
                    })

        # Delete all existing schedules
        ScheduleModel.query.delete()

        # Add new schedules
        for schedule_data in schedules_data:
            schedule = ScheduleModel(
                id=schedule_data['id'],
                gpio=schedule_data['gpio'],
                day=schedule_data['day'],
                time=schedule_data['time'],
                action=schedule_data['action'],
                enabled=schedule_data.get('enabled', True),
                fixed=schedule_data.get('fixed', True)
            )
            db.session.add(schedule)

        db.session.commit()

        # Log the change
        log_schedule_change(
            username=current_user.username,
            action='bulk_update',
            schedule_id=None,
            changes=changes
        )

        # Update timestamp
        set_schedules_timestamp()
        logger.info(f"User '{current_user.username}' updated schedules")

        # Sync with APScheduler (handles fixed schedules)
        sync_schedules()
        # Immediately recalculate sunset schedules (handles today's sunset schedules)
        recalculate_sunset_schedules()

        return jsonify({
            'success': True,
            'timestamp': server_timestamp.isoformat()
        })

    except Exception as e:
        logger.error(f"Error updating schedules: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/schedules/jobs', methods=['GET'])
@login_required
def get_scheduled_jobs():
    """Get current scheduled jobs from APScheduler"""
    jobs = []
    for job in scheduler.get_jobs():
        if job.id.startswith('schedule_'):
            next_run = job.next_run_time
            jobs.append({
                'id': job.id,
                'name': job.name,
                'next_run': next_run.isoformat() if next_run else None
            })
    return jsonify(jobs)


# API Routes - History
@app.route('/api/history/changes', methods=['GET'])
@login_required
def get_change_history():
    """Get schedule change history"""
    try:
        # Get pagination parameters
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Query history with pagination
        history = ScheduleChangeHistoryModel.query.order_by(
            ScheduleChangeHistoryModel.timestamp.desc()
        ).limit(limit).offset(offset).all()

        total_count = ScheduleChangeHistoryModel.query.count()

        return jsonify({
            'history': [{
                'id': h.id,
                'timestamp': format_local_datetime(h.timestamp),
                'username': h.username,
                'action': h.action,
                'schedule_id': h.schedule_id,
                'changes': json.loads(h.changes)
            } for h in history],
            'total_count': total_count,
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        logger.error(f"Error getting change history: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/history/executions', methods=['GET'])
@login_required
def get_execution_history():
    """Get schedule execution history"""
    try:
        # Get filter parameters
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        schedule_id = request.args.get('schedule_id', None)
        gpio = request.args.get('gpio', type=int)
        success_only = request.args.get('success_only', None, type=lambda v: v.lower() == 'true')
        execution_type = request.args.get('execution_type', None)

        # Build query
        query = ExecutionHistoryModel.query

        if schedule_id:
            query = query.filter_by(schedule_id=schedule_id)
        if gpio is not None:
            query = query.filter_by(gpio=gpio)
        if success_only is not None:
            query = query.filter_by(success=success_only)
        if execution_type:
            query = query.filter_by(execution_type=execution_type)

        # Get total count before pagination
        total_count = query.count()

        # Apply pagination and ordering
        executions = query.order_by(
            ExecutionHistoryModel.timestamp.desc()
        ).limit(limit).offset(offset).all()

        return jsonify({
            'executions': [{
                'id': e.id,
                'timestamp': format_local_datetime(e.timestamp),
                'schedule_id': e.schedule_id,
                'gpio': e.gpio,
                'action': e.action,
                'execution_type': e.execution_type,
                'username': e.username,
                'success': e.success,
                'error_message': e.error_message
            } for e in executions],
            'total_count': total_count,
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        logger.error(f"Error getting execution history: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/backup/export', methods=['GET'])
@require_admin
def export_backup():
    """Export a logical JSON backup"""
    try:
        payload = build_backup_payload()
        file_content = json.dumps(payload, ensure_ascii=False, indent=2).encode('utf-8')
        filename = f"scheduler_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        return send_file(
            BytesIO(file_content),
            mimetype='application/json',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        logger.error(f"Error exporting backup: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/backup/import', methods=['POST'])
@require_admin
def import_backup():
    """Import a logical JSON backup"""
    try:
        payload = request.get_json(silent=True)
        if payload is None and 'file' in request.files:
            payload = json.load(request.files['file'].stream)
        if payload is None:
            logger.warning(f'No JSON body or upload file')
            return jsonify({'error': 'Provide backup JSON body or upload a file field named file'}), 400

        restored = restore_backup_payload(payload)

        return jsonify({
            'success': True,
            'message': 'Backup imported successfully',
            'restored': restored,
            'timestamp': server_timestamp.isoformat()
        })
    except ValueError as e:
        logger.error(f"Invalid backup import payload: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error importing backup: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# User management (admin only)
@app.route('/api/users', methods=['GET'])
@require_admin
def get_users():
    """Get all users (passwords excluded)"""
    users = UserModel.query.all()
    return jsonify({
        user.username: {'role': user.role}
        for user in users
    })


@app.route('/api/users', methods=['POST'])
@require_admin
def create_user():
    """Create a new user"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        role = data.get('role', 'user')

        if not username or not password:
            logger.warning(f"Invalid user creation request: Missing username or password")
            return jsonify({'error': 'Username and password required'}), 400

        if db.session.get(UserModel, username):
            logger.info(f"User '{username}' already exists")
            return jsonify({'error': 'User already exists'}), 400

        user = UserModel(
            username=username,
            password_hash=generate_password_hash(password),
            role=role
        )
        db.session.add(user)
        db.session.commit()

        logger.info(f"Admin '{current_user.username}' created new user: {username}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<username>', methods=['DELETE'])
@require_admin
def delete_user(username):
    """Delete a user"""
    try:
        user = db.session.get(UserModel, username)
        if not user:
            logger.warning(f"User '{username}' not found")
            return jsonify({'error': 'User not found'}), 404

        db.session.delete(user)
        db.session.commit()

        logger.info(f"Admin '{current_user.username}' deleted user: {username}")
        return jsonify({'success': True})

    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<username>/password', methods=['PUT'])
@login_required
def change_password(username):
    """Change user password"""
    try:
        # Users can only change their own password unless they're admin
        if current_user.username != username and not current_user.is_admin():
            return jsonify({'error': 'Unauthorized'}), 403

        data = request.json
        new_password = data.get('password')

        if not new_password:
            logger.info('New password required')
            return jsonify({'error': 'New password required'}), 400

        user = db.session.get(UserModel, username)
        if not user:
            logger.warning(f"User '{username}' not found")
            logger.warning(f"User '{username}' not found")
            return jsonify({'error': 'User not found'}), 404

        user.password_hash = generate_password_hash(new_password)
        db.session.commit()

        if current_user.username == username:
            logger.info(f"User '{username}' changed their own password")
        else:
            logger.info(f"Admin '{current_user.username}' changed password for user: {username}")

        return jsonify({'success': True})

    except Exception as e:
        logger.error(f"Error changing password: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/update-backend', methods=['POST'])
@require_admin
def update_backend():
    """Backup current source files, download latest release source, and replace files."""
    try:
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_dir = DATA_DIR / f'sources_backup_{ts}'
        backup_www_dir = backup_dir / 'www'
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Backup existing files
        shutil.copy2(DATA_DIR / 'main.py', backup_dir / 'main.py')
        shutil.copytree(DATA_DIR / 'www', backup_www_dir)
        logger.info("Backed up current source to %s", backup_dir)

        zip_path = DATA_DIR / 'scheduler.zip'
        extract_dir = Path(tempfile.mkdtemp(prefix='scheduler_sources_', dir=str(DATA_DIR)))

        try:
            # Download latest source
            subprocess.run(['wget', '-O', str(zip_path), 'https://github.com/NadavK/scheduler/archive/refs/heads/main.zip'], check=True)

            # Unzip
            subprocess.run(['unzip', '-o', str(zip_path), '-d', str(extract_dir)], check=True)

            extracted_root = extract_dir / 'scheduler-main'
            new_main = extracted_root / 'main.py'
            new_www = extracted_root / 'www'

            if not new_main.exists():
                raise FileNotFoundError("Downloaded package does not contain main.py")
            if not new_www.exists():
                raise FileNotFoundError("Downloaded package does not contain www/")

            # Replace source files
            shutil.copy2(new_main, DATA_DIR / 'main.py')

            target_www = DATA_DIR / 'www'
            shutil.rmtree(target_www)
            shutil.copytree(new_www, target_www)

            logger.info("Backend updated successfully from GitHub")

            # Restart service
            def restart_service_after_delay(delay_seconds: int = 5):
                time.sleep(delay_seconds)
                restart_result = subprocess.run(['sudo', 'service', 'scheduler', 'restart'], capture_output=True, text=True)
                # subprocess.Popen(['bash', '-c', 'sleep 5 && sudo service scheduler restart'])

                if restart_result.returncode != 0:
                    logger.error("Service restart failed: %s", restart_result.stderr)

            threading.Thread(target=restart_service_after_delay, args=(2,), daemon=True).start()

            return jsonify({
                'success': True,
                'backup_dir': str(backup_dir),
                'message': 'Updated successfully.'
            })

        finally:
            if zip_path.exists():
                zip_path.unlink(missing_ok=True)
            shutil.rmtree(extract_dir, ignore_errors=True)

    except Exception as e:
        logger.error(f"Error updating backend: {e}")
        return jsonify({'error': str(e)}), 500


# Static file serving
@app.route('/')
def index():
    return send_from_directory('www', 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('www', filename)


@app.route('/api/time', methods=['GET'])
@login_required
def get_device_time():
    """Return the device/server local time."""
    now_utc = datetime.now(UTC)
    return jsonify({
        'utc': now_utc.isoformat(),
        'local': now_utc.astimezone(local_tz).isoformat(),
        'local_formatted': now_utc.astimezone(local_tz).strftime('%d/%m/%Y %H:%M:%S')
    })


def initialize_database():
    """Initialize database with default data"""
    with app.app_context():
        inspector = db.inspect(db.engine)
        table_names = set(inspector.get_table_names())

        if 'schedule_execution_history' in table_names:
            with db.engine.begin() as connection:
                connection.exec_driver_sql('DROP TABLE schedule_execution_history')
            logger.info("Dropped legacy table: schedule_execution_history")


        # Create all tables
        db.create_all()

        # Create default admin user if no users exist
        if UserModel.query.count() == 0:
            admin = UserModel(
                username='admin',
                password_hash=generate_password_hash('admin'),
                role='admin'
            )
            db.session.add(admin)
            db.session.commit()
            logger.warning("Created default admin user (username: admin, password: admin)")

        # Initialize schedules timestamp if not exists
        if not db.session.get(MetadataModel, 'schedules_timestamp'):
            metadata = MetadataModel(
                key='schedules_timestamp',
                value=datetime.now().isoformat()
            )
            db.session.add(metadata)
            db.session.commit()


def logrotate():
    try:
        subprocess.run(['/usr/sbin/logrotate', '/home/lechu/scheduler/scripts/logrotate.conf', '-s', '/home/lechu/scheduler/log/logrotate.status'], check=True)
        logger.info(f'Ran logrotate')
    except Exception as e:
        logger.error(f"Error running logrotate: {e}")


def daily_jobs():
    with app.app_context():
        logrotate()
        recalculate_sunset_schedules()

def main():
    with app.app_context():
        """Main entry point"""
        logrotate()
        logger.info("=" * 50)
        logger.info(f"GPIO Scheduler v{VERSION}")
        logger.info("=" * 50)
        logger.info(f"Data directory: {DATA_DIR}")
        logger.info(f"Database: {DB_PATH}")
        logger.info(f"Rate limiting: {MAX_LOGIN_ATTEMPTS} attempts per {LOGIN_LOCKOUT_DURATION}s")

        # Initialize database
        initialize_database()

        # Load schedules timestamp
        get_schedules_timestamp()

        # Restore GPIO states from last session
        restore_gpio_states()

        # Load and sync schedules on startup
        logger.info("Syncing schedules...")
        sync_schedules()

        # Add a daily sunset recalculation job at 00:01
        scheduler.add_job(
            func=daily_jobs,
            trigger=CronTrigger(hour=0, minute=1, timezone=local_tz),
            id='daily_sunset_recalc',
            name='Daily Sunset Recalculation'
        )

        # Run sunset calculation immediately on startup
        recalculate_sunset_schedules()

    # Start Flask server
    port = int(os.environ.get('PORT', 8099))
    logger.info(f"Starting web server on port {port}...")
    logger.debug(f"Access the interface at http://localhost:{port}")

    app.run(host='0.0.0.0', port=port, debug=False)


if __name__ == '__main__':
    main()


# TODO: Daily backup (to my computer)
# TODO: Add RTC

# TODO: Things to discuss with Abba:
# Daily restart at 3:29 may flicker lights
# TODO: UPS. how to make all gpios start off?


# DONE: Remote access (https://connect.raspberrypi.com/devices/b93747cf-08c3-43fb-a5cb-0fb33e17beb1)
# DONE: check that enabled/disabled works
# DONE: check that TZ time works
# DONE: logrotate
# DONE: Prevent duplicate schedules
# DONE: If a scheduled was changed from enabled to disabled, is the old apscheduler job deleted?
# DONE: Daily restart. Done via crontab
# DONE: persist logins even if server restarts
# DONE: Add backup config file for each save, and use it if the primary file is corrupt
# On startup, return gpios to last known state
# DONE: Add history, to schedules changes: when, what and by whom. also add a history for executed schedules
# DONE: Create a UI for managing users (should only be accessible for admins)
# DONE: export
# DONE: Port 80
# DONE: https/cloudlfare
# DONE: the default output should be empty
# DONE: when adding a new schedule the filters are used to set the default values. fields that dont have an active filter should be set to empty to force the user to set.
# DONE: prevent user from saving schedules that are not set with values
# DONE: prevent user from saving duplicates
# DONE: only sort when saving or filtering. don't sort when user edits a schedule
